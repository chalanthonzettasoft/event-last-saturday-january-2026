package main

import (
	"bufio"
	"context"
	"fmt"
	"log"
	"os"
	"slices"
	"strings"

	"google.golang.org/genai"
)

func main() {
	// 1. Load API Key from ../.env
	apiKey := loadEnvKey("../.env", "VITE_GOOGLE_API_KEY")
	if apiKey == "" {
		log.Fatal("Could not find VITE_GOOGLE_API_KEY in ../.env")
	}

	ctx := context.Background()
	// NOTE: The user's snippet used genai.NewClient.
	// We assume the user refers to `google.golang.org/genai`.
	client, err := genai.NewClient(ctx, &genai.ClientConfig{
		APIKey:  apiKey,
		Backend: genai.BackendGeminiAPI,
	})
	if err != nil {
		log.Fatal(err)
	}

	// Retrieve the list of models.
	// Using generic List request if ListModelsConfig is empty/default
	models, err := client.Models.List(ctx, &genai.ListModelsConfig{})
	if err != nil {
		log.Fatalf("Error listing models: %v", err)
	}

	fmt.Println("List of models that support generateContent:")
	for _, m := range models.Items {
		if slices.Contains(m.SupportedActions, "generateContent") {
			fmt.Printf("- %s\n", m.Name)
		}
	}

	fmt.Println("\nList of models that support embedContent:")
	for _, m := range models.Items {
		if slices.Contains(m.SupportedActions, "embedContent") {
			fmt.Printf("- %s\n", m.Name)
		}
	}
}

func loadEnvKey(filepath string, key string) string {
	file, err := os.Open(filepath)
	if err != nil {
		log.Printf("Warning: could not open %s: %v", filepath, err)
		return ""
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if strings.HasPrefix(line, key+"=") {
			return strings.TrimPrefix(line, key+"=")
		}
	}
	return ""
}
