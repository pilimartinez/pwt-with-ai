import { experimental_createMCPClient, generateText, stepCountIs, tool } from "ai";
import z from "zod/v4";
import fs from "fs";
import util from 'node:util';
import child_process from 'node:child_process';

export async function codingAgent(prompt: string) {
  const pwtMcp = await experimental_createMCPClient({
    transport: {
      type: 'sse',
      url: 'http://localhost:8931/sse'
    }
  })

  const pwtTools = await pwtMcp.tools()

  const result = await generateText({
    model: "openai/gpt-4.1-mini",
    prompt,
    stopWhen: stepCountIs(10),
    system:
      `
        You are a Playwright expert. Analyze the provided website and generate robust playwright test suites that cover the most critical user flows and interactions on the first attempt.
        Your Process:

        - First, thoroughly explore the website structure using available tools to understand the page layout, elements, and their attributes
        - Identify unique, stable selectors by examining the actual HTML structure
        - Plan test scenarios that focus on business-critical functionality and conversion paths
        - Generate well-structured, maintainable tests that avoid common pitfalls

        Test Requirements:

        - Follow standard Playwright naming conventions (.spec.ts files)
        - Create all tests in the 'tests' folder (use create_directory tool if needed)
        - Write tests that are resilient to UI changes
        - Use specific, unique selectors that won't cause strict mode violations
        - Include proper waits and assertions for reliable execution
        - Focus on user flows that would impact business/revenue if broken

        Critical Areas to Test:

        - Core conversion paths (signup, demo requests, purchases)
        - Primary navigation and key user journeys
        - Critical interactive elements (forms, CTAs, dropdowns)
        - Mobile responsiveness for key flows
        - Error handling for important forms

        Selector Best Practices:

        - ALWAYS use specific, unique locators that match only ONE element
        - For navigation elements: Use page.getByRole('navigation').getByRole('button', { name: 'Product' }) instead of generic text selectors
        - For CTA buttons: Use context + role, e.g., page.getByRole('main').getByRole('link', { name: 'Book a demo' })
        - Use .first() or .nth(0) when you specifically want the first occurrence
        - Test selectors by checking if they're unique: combine container + element type + text
        - Avoid generic text selectors like text=Product that match multiple elements
        - Use CSS selectors with specific classes or IDs when role-based selectors aren't unique
        - Structure locators hierarchically: container.getByRole().getByText() rather than page-wide searches

        Execution:

        - Use tools to create and edit files (never output code directly)
        - Run tests once after creation to validate they work
        - If tests fail due to strict mode violations, provide detailed analysis and recommend creating NEW tests with better selectors rather than editing existing ones
        - Do NOT automatically re-run or edit tests - instead provide specific guidance on how to write better selectors
      `,
    tools: {
      create_directory: tool({
        description:
          "Create a directory at the specified path.",
        inputSchema: z.object({
          path: z
            .string()
            .describe("The path of the directory to create"),
        }),
        execute: async ({ path }) => {
          try {
            console.log(`Creating directory at '${path}'`);
            fs.mkdirSync(path, { recursive: true });
            return { path, success: true };
          } catch (error) {
            console.error(`Error creating directory at ${path}:`, error.message);
            return { path, error: error.message, success: false };
          }
        },
      }),
      list_files: tool({
        description:
          "List files and directories at a given path. If no path is provided, lists files in the current directory.",
        inputSchema: z.object({
          path: z
            .string()
            .nullable()
            .describe(
              "Optional relative path to list files from. Defaults to current directory if not provided.",
            ),
        }),
        execute: async ({ path: generatedPath }) => {
          if (generatedPath === ".git" || generatedPath === "node_modules") {
            return { error: "You cannot read the path: ", generatedPath };
          }
          const path = generatedPath?.trim() ? generatedPath : ".";
          try {
            console.log(`Listing files at '${path}'`);
            const output = fs.readdirSync(path, {
              recursive: false,
            });
            return { path, output };
          } catch (e) {
            console.error(`Error listing files:`, e);
            return { error: e };
          }
        },
      }),
      read_file: tool({
        description:
          "Read the contents of a given relative file path. Use this when you want to see what's inside a file. Do not use this with directory names.",
        inputSchema: z.object({
          path: z
            .string()
            .describe("The relative path of a file in the working directory."),
        }),
        execute: async ({ path }) => {
          try {
            console.log(`Reading file at '${path}'`);
            const output = fs.readFileSync(path, "utf-8");
            return { path, output };
          } catch (error) {
            console.error(`Error reading file at ${path}:`, error.message);
            return { path, error: error.message };
          }
        },
      }),
      edit_file: tool({
        description:
          "Make edits to a text file or create a new file. Replaces 'old_str' with 'new_str' in the given file. 'old_str' and 'new_str' MUST be different from each other. If the file specified with path doesn't exist, it will be created.",
          inputSchema: z.object({
            path: z.string().describe("The path to the file"),
            old_str: z
              .string()
              .nullable()
              .describe(
                "Text to search for - must match exactly and must only have one match exactly",
              ),
            new_str: z.string().describe("Text to replace old_str with"),
          }),
          execute: async ({ path, old_str, new_str }) => {
            try {
              const fileExists = fs.existsSync(path);
              if (fileExists && old_str !== null) {
                console.log(`Editing file '${path}'`);
                const fileContents = fs.readFileSync(path, "utf-8");
                const newContents = fileContents.replace(old_str, new_str);
                fs.writeFileSync(path, newContents);
                return { path, success: true, action: "edit" };
              } else {
                console.log(`Creating file '${path}'`);
                fs.writeFileSync(path, new_str);
                return { path, success: true, action: "create" };
              }
            } catch (e) {
              console.error(`Error editing file ${path}:`, e);
              return { error: e, success: false };
            }
          },
      }),
      run_pwt: tool({
        description:
          "Run Playwright tests using the provided command. The command should be a valid Playwright test command.",
        inputSchema: z.object({
          specFile: z.string().describe("The Playwright test file to run. It should be a .spec.ts file."),
        }),
        execute: async ({ specFile }) => {
          try {
            const exec = util.promisify(child_process.exec);
            console.log('Running Playwright tests:', specFile);
            const { stdout, stderr } = await exec(`npx playwright test ${specFile}`);
            console.log('Playwright tests finished running');
            console.log('Test Results:');
            console.log(stdout);
            
            return { stdout, stderr, success: true };
          } catch (error) {
            // Check if this is actually a test execution (has stdout) or a real command error
            if (error.stdout && error.stdout.trim()) {
              // Tests ran but some failed - this is normal
              console.log('Playwright tests finished running - some tests failed');
              console.log('Test Results:');
              console.log(error.stdout);
              return { 
                stdout: error.stdout,
                stderr: error.stderr || '',
                success: false,
                message: 'Tests executed but some failed. See results above.'
              };
            } else {
              // Actual command execution error (e.g., Playwright not installed)
              console.error('Error running Playwright command:', error);
              return { 
                error: error.message,
                stdout: error.stdout || '',
                stderr: error.stderr || '',
                success: false 
              };
            }
          }
        },
      }),
      ...pwtTools,
    },
  });

  return { response: result.text };
}