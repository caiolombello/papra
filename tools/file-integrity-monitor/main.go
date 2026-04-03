// file-integrity-monitor watches critical files for changes and alerts via SNS.
//
// It computes SHA-256 hashes of configured files at startup, then periodically
// re-checks. If any file is modified, created, or deleted, it sends an alert
// to the configured SNS topic.
//
// Usage:
//   file-integrity-monitor [flags]
//
// Config file (default: /opt/papra/fim.conf):
//   # One file path per line
//   /opt/papra/.env
//   /opt/papra/secrets.map
//   /etc/meeting-transcriber.env
//   /etc/gitlab-runner/config.toml
package main

import (
	"bufio"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"log"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/sns"
)

type fileState struct {
	hash   string
	exists bool
	size   int64
	mode   os.FileMode
}

func main() {
	log.SetFlags(log.LstdFlags)
	log.SetPrefix("fim: ")

	confPath := "/opt/papra/fim.conf"
	region := "sa-east-1"
	snsTopic := ""
	interval := 60 * time.Second

	args := os.Args[1:]
	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "--config", "-c":
			i++
			if i < len(args) {
				confPath = args[i]
			}
		case "--region", "-r":
			i++
			if i < len(args) {
				region = args[i]
			}
		case "--sns-topic", "-t":
			i++
			if i < len(args) {
				snsTopic = args[i]
			}
		case "--interval", "-i":
			i++
			if i < len(args) {
				d, err := time.ParseDuration(args[i])
				if err == nil {
					interval = d
				}
			}
		case "--help", "-h":
			fmt.Println(`file-integrity-monitor — watch files for changes and alert via SNS

Usage: file-integrity-monitor [flags]

Flags:
  -c, --config FILE      Path to config file (default: /opt/papra/fim.conf)
  -r, --region REGION    AWS region (default: sa-east-1)
  -t, --sns-topic ARN    SNS topic ARN for alerts (optional, logs to stderr if not set)
  -i, --interval DUR     Check interval (default: 60s)
  -h, --help             Show help

Config file format (one path per line, # comments):
  /opt/papra/.env
  /etc/meeting-transcriber.env`)
			os.Exit(0)
		}
	}

	// Read config
	paths, err := readConfig(confPath)
	if err != nil {
		log.Fatalf("failed to read config: %v", err)
	}
	if len(paths) == 0 {
		log.Fatal("no files to monitor")
	}

	log.Printf("monitoring %d files, interval=%s", len(paths), interval)

	// Initial baseline
	baseline := make(map[string]fileState, len(paths))
	for _, p := range paths {
		baseline[p] = computeState(p)
		log.Printf("  %s hash=%s exists=%v", p, baseline[p].hash[:12], baseline[p].exists)
	}

	// Setup SNS client if topic provided
	var snsClient *sns.Client
	if snsTopic != "" {
		cfg, err := config.LoadDefaultConfig(context.Background(), config.WithRegion(region))
		if err != nil {
			log.Fatalf("failed to load AWS config: %v", err)
		}
		snsClient = sns.NewFromConfig(cfg)
		log.Printf("alerts will be sent to %s", snsTopic)
	}

	// Watch loop
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer stop()

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Println("shutting down")
			return
		case <-ticker.C:
			for _, p := range paths {
				current := computeState(p)
				prev := baseline[p]

				var change string
				switch {
				case !prev.exists && current.exists:
					change = "FILE CREATED"
				case prev.exists && !current.exists:
					change = "FILE DELETED"
				case prev.hash != current.hash:
					change = "FILE MODIFIED"
				case prev.mode != current.mode:
					change = fmt.Sprintf("PERMISSIONS CHANGED (%o -> %o)", prev.mode, current.mode)
				default:
					continue
				}

				msg := fmt.Sprintf("[FIM ALERT] %s: %s\nPrevious: hash=%s size=%d mode=%o\nCurrent:  hash=%s size=%d mode=%o\nHost: %s\nTime: %s",
					change, p,
					prev.hash, prev.size, prev.mode,
					current.hash, current.size, current.mode,
					hostname(), time.Now().UTC().Format(time.RFC3339),
				)

				log.Printf("ALERT: %s — %s", change, p)

				if snsClient != nil && snsTopic != "" {
					subject := fmt.Sprintf("FIM: %s — %s", change, p)
					_, err := snsClient.Publish(ctx, &sns.PublishInput{
						TopicArn: &snsTopic,
						Subject:  &subject,
						Message:  &msg,
					})
					if err != nil {
						log.Printf("ERROR: failed to publish SNS: %v", err)
					}
				}

				baseline[p] = current
			}
		}
	}
}

func readConfig(path string) ([]string, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var paths []string
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		paths = append(paths, line)
	}
	return paths, scanner.Err()
}

func computeState(path string) fileState {
	info, err := os.Stat(path)
	if err != nil {
		return fileState{hash: "0000000000000000", exists: false}
	}

	h := sha256.New()
	f, err := os.Open(path)
	if err != nil {
		return fileState{hash: "error-reading", exists: true, size: info.Size(), mode: info.Mode().Perm()}
	}
	defer f.Close()

	if _, err := io.Copy(h, f); err != nil {
		return fileState{hash: "error-hashing", exists: true, size: info.Size(), mode: info.Mode().Perm()}
	}

	return fileState{
		hash:   hex.EncodeToString(h.Sum(nil)),
		exists: true,
		size:   info.Size(),
		mode:   info.Mode().Perm(),
	}
}

func hostname() string {
	h, _ := os.Hostname()
	if h == "" {
		return "unknown"
	}
	return h
}
