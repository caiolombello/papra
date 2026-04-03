// pdf-unlock attempts to unlock a password-protected PDF by trying a list of
// candidate passwords. Uses qpdf under the hood for decryption.
//
// It can generate candidates from patterns (e.g., first 3 digits of CPF)
// or read them from a file/stdin.
//
// Usage:
//   pdf-unlock [flags] <input.pdf>
//
// Examples:
//   pdf-unlock -p "123,456,789" input.pdf
//   pdf-unlock -f passwords.txt input.pdf
//   pdf-unlock --cpf-prefix "456.918.230-96" input.pdf
//   echo -e "123\n456" | pdf-unlock -f - input.pdf
package main

import (
	"bufio"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

func main() {
	log.SetFlags(0)

	var passwords []string
	var inputFile string
	var outputFile string
	workers := 4

	args := os.Args[1:]
	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "-p", "--passwords":
			i++
			if i < len(args) {
				for _, p := range strings.Split(args[i], ",") {
					p = strings.TrimSpace(p)
					if p != "" {
						passwords = append(passwords, p)
					}
				}
			}
		case "-f", "--file":
			i++
			if i < len(args) {
				ps, err := readPasswordFile(args[i])
				if err != nil {
					log.Fatalf("failed to read password file: %v", err)
				}
				passwords = append(passwords, ps...)
			}
		case "--cpf-prefix":
			i++
			if i < len(args) {
				passwords = append(passwords, cpfPrefixes(args[i])...)
			}
		case "--cpf-brute":
			// Generate all 3-digit combinations (000-999)
			for n := 0; n < 1000; n++ {
				passwords = append(passwords, fmt.Sprintf("%03d", n))
			}
		case "-o", "--output":
			i++
			if i < len(args) {
				outputFile = args[i]
			}
		case "-w", "--workers":
			i++
			if i < len(args) {
				fmt.Sscanf(args[i], "%d", &workers)
			}
		case "-h", "--help":
			fmt.Println(`pdf-unlock — try passwords to unlock a protected PDF

Usage: pdf-unlock [flags] <input.pdf>

Flags:
  -p, --passwords LIST   Comma-separated passwords to try
  -f, --file FILE        File with one password per line (use - for stdin)
  --cpf-prefix CPF       Extract 3-digit prefix from CPF number
  --cpf-brute            Try all 000-999 combinations
  -o, --output FILE      Output file (default: <input>-unlocked.pdf)
  -w, --workers N        Parallel workers (default: 4)
  -h, --help             Show help

Requires qpdf to be installed.`)
			os.Exit(0)
		default:
			if !strings.HasPrefix(args[i], "-") {
				inputFile = args[i]
			}
		}
	}

	if inputFile == "" {
		log.Fatal("no input PDF specified")
	}
	if len(passwords) == 0 {
		log.Fatal("no passwords to try. Use -p, -f, --cpf-prefix, or --cpf-brute")
	}
	if outputFile == "" {
		ext := filepath.Ext(inputFile)
		outputFile = strings.TrimSuffix(inputFile, ext) + "-unlocked" + ext
	}

	// Verify qpdf is available
	if _, err := exec.LookPath("qpdf"); err != nil {
		log.Fatal("qpdf not found. Install with: apt install qpdf")
	}

	log.Printf("Trying %d passwords with %d workers on %s", len(passwords), workers, inputFile)
	start := time.Now()

	found, password := tryPasswords(inputFile, outputFile, passwords, workers)

	elapsed := time.Since(start)
	if found {
		log.Printf("UNLOCKED with password %q in %s → %s", password, elapsed, outputFile)
	} else {
		log.Printf("FAILED — none of %d passwords worked (%s)", len(passwords), elapsed)
		os.Exit(1)
	}
}

func tryPasswords(input, output string, passwords []string, workers int) (bool, string) {
	var found atomic.Bool
	var foundPassword atomic.Value
	foundPassword.Store("")

	ch := make(chan string, len(passwords))
	for _, p := range passwords {
		ch <- p
	}
	close(ch)

	var wg sync.WaitGroup
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for pw := range ch {
				if found.Load() {
					return
				}
				if tryPassword(input, output, pw) {
					found.Store(true)
					foundPassword.Store(pw)
					return
				}
			}
		}()
	}

	wg.Wait()
	return found.Load(), foundPassword.Load().(string)
}

func tryPassword(input, output, password string) bool {
	cmd := exec.Command("qpdf", "--password="+password, "--decrypt", input, output)
	err := cmd.Run()
	if err == nil {
		return true
	}
	// Clean up failed output
	os.Remove(output)
	return false
}

func readPasswordFile(path string) ([]string, error) {
	var f *os.File
	var err error
	if path == "-" {
		f = os.Stdin
	} else {
		f, err = os.Open(path)
		if err != nil {
			return nil, err
		}
		defer f.Close()
	}

	var passwords []string
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		p := strings.TrimSpace(scanner.Text())
		if p != "" && !strings.HasPrefix(p, "#") {
			passwords = append(passwords, p)
		}
	}
	return passwords, scanner.Err()
}

// cpfPrefixes extracts common password patterns from a CPF number.
// Brazilian utility companies often use the first 3 digits as PDF password.
func cpfPrefixes(cpf string) []string {
	// Strip formatting
	digits := strings.Map(func(r rune) rune {
		if r >= '0' && r <= '9' {
			return r
		}
		return -1
	}, cpf)

	if len(digits) < 3 {
		return []string{digits}
	}

	prefixes := []string{
		digits[:3],         // First 3 digits (most common)
		digits[:4],         // First 4
		digits[:6],         // First 6
		digits,             // Full CPF
		digits[:3] + "000", // Padded variant
	}

	// Deduplicate
	seen := make(map[string]bool)
	var result []string
	for _, p := range prefixes {
		if !seen[p] && p != "" {
			seen[p] = true
			result = append(result, p)
		}
	}
	return result
}
