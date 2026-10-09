//go:build !windows

package main

import (
	"fmt"
	"os"
)

// On Linux and macOS the launcher only serves the game: open the printed address in a browser.
func main() {
	url, running, err := serve()
	if err != nil {
		fmt.Fprintln(os.Stderr, "Sixth Front could not start:", err)
		os.Exit(1)
	}
	if running {
		fmt.Println("Sixth Front is already running at", url)
		return
	}
	fmt.Println("Sixth Front is running at", url, "(Ctrl+C to quit)")
	select {}
}
