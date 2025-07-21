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
      You are a Playwright expert. Analyze the provided website, and generate playwright test suites that cover the most critical user flows and interactions. Your tests should be robust, maintainable, and prioritize business-critical functionality.
      The tests you generate should follow the standard naming conventions and structure of Playwright tests, including .spec.ts naming. All tests should be in the tests folder, if the tests folder does not exist, create it using the create_directory tool.
      - Analyzing websites to identify business-critical functionality
      - Finding conversion paths, user flows, and key interactions
      - Providing specific CSS selectors and element identification
      - Prioritizing test scenarios by business impact
      - Understanding what breaks would cause user/revenue loss
      
      Make sure you do not output the code for the tests directly. Instead, use the tools provided to create and edit files as needed.
      After creating the test files, run them using the provided tools. If running the tests fails, output all the relevant information to fix it.
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
          const exec = util.promisify(child_process.exec);

          const { stdout, stderr } = await exec(`npx playwright test ${specFile}`);

          console.log('Running Playwright tests:', specFile);
          return stdout
        },
      }),
      ...pwtTools,
    },
  });

  return { response: result.text };
}