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
    model: "anthropic/claude-3-5-sonnet",
    prompt,
    temperature: 0,
    stopWhen: stepCountIs(10),
    system:
      `
    You are a Playwright expert. Analyze the provided website, and generate playwright test suites that cover the most critical user flows and interactions. Your tests should be robust, maintainable, and prioritize business-critical functionality.
    
    Your ONLY task:
    - Use tools to inspect and navigate deeply the user provided url
    - Locate specific selectors that exist and point to critical flows
    - Generate one Playwright test file ('.spec.ts') in 'tests/' that:
        - Use tools to navigate and inspect deeply the user provided url
        - Locates the element with a reliable selector (you MUST verify it twice)
        - Clicks it or asserts visibility
        - Passes when run via run_pwt tool

    Selector Safety Rules (MANDATORY):
      - If a selector like getByRole(...) resolves to more than one element:
        - Always disambiguate using .nth(n) or a container like page.locator('#nav').getByRole(...)
        - You MUST resolve to exactly one element to avoid strict mode violations
        - NEVER interact with a locator that resolves to multiple elements
        - Only use texts that you are sure exist
        - Implement proper waiting mechanisms
        - If a selector is unreachable due to visibility or position, you may retry by scrolling into view:
  await locator.scrollIntoViewIfNeeded()
    
    IMPORTANT:
    - Use 'await element.waitFor({ state: "visible" })' before actions
    - Do not use filters or .first() unless necessary
    - Avoid elements with target="_blank" that open in new windows
    - All test from the suite should pass first try, if not, edit and fix only the failing ones
    - Do NOT create more than one test file
    - If at the end tests fail, retrieve how we can improve
    
    Do not output code directly. Use tools only.
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