// secrets-injector resolves secrets from AWS SSM Parameter Store and executes
// a child process with those secrets injected as environment variables.
//
// Usage:
//   secrets-injector [flags] -- command [args...]
//
// It reads a mapping file (default: /opt/papra/secrets.map) that maps
// environment variable names to SSM parameter paths:
//
//   AUTH_SECRET=/papra/auth-secret
//   DATABASE_ENCRYPTION_KEY=/papra/database-encryption-key
//   OPENAI_API_KEY=/meeting-transcriber/openai-api-key
//
// The resolved values are injected into the child process environment
// without ever touching disk (no .env files with plaintext secrets).
package main

import (
	"bufio"
	"context"
	"fmt"
	"log"
	"os"
	"os/exec"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/ssm"
)

func main() {
	log.SetFlags(0)
	log.SetPrefix("secrets-injector: ")

	mapFile := "/opt/papra/secrets.map"
	region := "sa-east-1"
	var cmdArgs []string

	// Parse flags
	args := os.Args[1:]
	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "--map", "-m":
			i++
			if i < len(args) {
				mapFile = args[i]
			}
		case "--region", "-r":
			i++
			if i < len(args) {
				region = args[i]
			}
		case "--":
			cmdArgs = args[i+1:]
			i = len(args) // break
		case "--help", "-h":
			fmt.Println(`secrets-injector — resolve SSM secrets and exec child process

Usage: secrets-injector [flags] -- command [args...]

Flags:
  -m, --map FILE     Path to secrets mapping file (default: /opt/papra/secrets.map)
  -r, --region REGION  AWS region (default: sa-east-1)
  -h, --help         Show this help

Map file format (one per line):
  ENV_VAR_NAME=/ssm/parameter/path

Example:
  secrets-injector -m /opt/papra/secrets.map -- docker run --env-file /dev/stdin myimage`)
			os.Exit(0)
		default:
			// If no -- separator, treat remaining as command
			cmdArgs = args[i:]
			i = len(args)
		}
	}

	if len(cmdArgs) == 0 {
		log.Fatal("no command specified. Usage: secrets-injector [flags] -- command [args...]")
	}

	// Read mapping file
	mappings, err := readMappings(mapFile)
	if err != nil {
		log.Fatalf("failed to read mappings from %s: %v", mapFile, err)
	}

	if len(mappings) == 0 {
		log.Fatalf("no mappings found in %s", mapFile)
	}

	// Resolve secrets from SSM
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	resolved, err := resolveSecrets(ctx, region, mappings)
	if err != nil {
		log.Fatalf("failed to resolve secrets: %v", err)
	}

	log.Printf("resolved %d/%d secrets from SSM", len(resolved), len(mappings))

	// Build environment: parent env + resolved secrets
	env := os.Environ()
	for k, v := range resolved {
		env = appendOrReplace(env, k, v)
	}

	// Exec child process (replaces current process)
	binary, err := exec.LookPath(cmdArgs[0])
	if err != nil {
		log.Fatalf("command not found: %s", cmdArgs[0])
	}

	// Forward signals to child
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGTERM, syscall.SIGINT)

	cmd := exec.Command(binary, cmdArgs[1:]...)
	cmd.Env = env
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Start(); err != nil {
		log.Fatalf("failed to start %s: %v", cmdArgs[0], err)
	}

	// Forward signals
	go func() {
		for sig := range sigCh {
			_ = cmd.Process.Signal(sig)
		}
	}()

	if err := cmd.Wait(); err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			os.Exit(exitErr.ExitCode())
		}
		log.Fatalf("command failed: %v", err)
	}
}

// readMappings parses a file of KEY=/ssm/path lines.
func readMappings(path string) (map[string]string, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	mappings := make(map[string]string)
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			continue
		}
		envVar := strings.TrimSpace(parts[0])
		ssmPath := strings.TrimSpace(parts[1])
		if envVar != "" && ssmPath != "" {
			mappings[envVar] = ssmPath
		}
	}
	return mappings, scanner.Err()
}

// resolveSecrets fetches parameter values from SSM in batches of 10.
func resolveSecrets(ctx context.Context, region string, mappings map[string]string) (map[string]string, error) {
	cfg, err := config.LoadDefaultConfig(ctx, config.WithRegion(region))
	if err != nil {
		return nil, fmt.Errorf("load AWS config: %w", err)
	}

	client := ssm.NewFromConfig(cfg)
	resolved := make(map[string]string, len(mappings))

	// Collect unique paths
	paths := make([]string, 0, len(mappings))
	pathToEnv := make(map[string][]string) // one SSM path can map to multiple env vars
	for envVar, path := range mappings {
		pathToEnv[path] = append(pathToEnv[path], envVar)
		if len(pathToEnv[path]) == 1 {
			paths = append(paths, path)
		}
	}

	// Batch GetParameters (max 10 per call)
	for i := 0; i < len(paths); i += 10 {
		end := i + 10
		if end > len(paths) {
			end = len(paths)
		}
		batch := paths[i:end]

		output, err := client.GetParameters(ctx, &ssm.GetParametersInput{
			Names:          batch,
			WithDecryption: boolPtr(true),
		})
		if err != nil {
			return nil, fmt.Errorf("GetParameters: %w", err)
		}

		for _, param := range output.Parameters {
			if param.Name == nil || param.Value == nil {
				continue
			}
			for _, envVar := range pathToEnv[*param.Name] {
				resolved[envVar] = *param.Value
			}
		}

		if len(output.InvalidParameters) > 0 {
			log.Printf("WARNING: %d parameters not found: %v", len(output.InvalidParameters), output.InvalidParameters)
		}
	}

	return resolved, nil
}

func appendOrReplace(env []string, key, value string) []string {
	prefix := key + "="
	for i, e := range env {
		if strings.HasPrefix(e, prefix) {
			env[i] = prefix + value
			return env
		}
	}
	return append(env, prefix+value)
}

func boolPtr(v bool) *bool { return &v }
