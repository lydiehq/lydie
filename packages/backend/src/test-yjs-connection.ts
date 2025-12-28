/**
 * Simple test script to verify Yjs WebSocket server is running
 * Run with: bun run src/test-yjs-connection.ts
 */

import WebSocket from "ws";

const TEST_DOCUMENT_ID = "test-doc-123";
const YJS_SERVER_URL = "ws://localhost:1234";

console.log("Testing Yjs WebSocket server connection...\n");

// Test 1: Connection without token (should fail)
console.log("Test 1: Connecting without authentication token...");
const ws1 = new WebSocket(`${YJS_SERVER_URL}/${TEST_DOCUMENT_ID}`);

ws1.on("open", () => {
  console.log("❌ FAIL: Connection opened without token (should be rejected)");
  ws1.close();
});

ws1.on("close", (code, reason) => {
  if (code === 4001) {
    console.log("✅ PASS: Connection rejected (code 4001: Authentication required)\n");
  } else {
    console.log(`⚠️  Connection closed with code ${code}: ${reason}\n`);
  }
});

ws1.on("error", (error) => {
  console.log(`⚠️  Connection error: ${error.message}\n`);
});

// Test 2: Connection with invalid token (should fail)
setTimeout(() => {
  console.log("Test 2: Connecting with invalid token...");
  const ws2 = new WebSocket(
    `${YJS_SERVER_URL}/${TEST_DOCUMENT_ID}?token=invalid-token-123`
  );

  ws2.on("open", () => {
    console.log("❌ FAIL: Connection opened with invalid token (should be rejected)");
    ws2.close();
  });

  ws2.on("close", (code, reason) => {
    if (code === 4002 || code === 4004) {
      console.log(`✅ PASS: Connection rejected (code ${code}: Invalid authentication)\n`);
    } else {
      console.log(`⚠️  Connection closed with code ${code}: ${reason}\n`);
    }
  });

  ws2.on("error", (error) => {
    console.log(`⚠️  Connection error: ${error.message}\n`);
  });
}, 1000);

// Test 3: Server is running
setTimeout(() => {
  console.log("Test 3: Checking if server is running...");
  const ws3 = new WebSocket(`${YJS_SERVER_URL}/ping`);

  ws3.on("open", () => {
    console.log("✅ PASS: Yjs WebSocket server is running and accepting connections");
    ws3.close();
    process.exit(0);
  });

  ws3.on("error", (error) => {
    console.log(`❌ FAIL: Cannot connect to Yjs server: ${error.message}`);
    console.log("\nMake sure the backend is running with: bun run dev");
    process.exit(1);
  });
}, 2000);

// Timeout after 5 seconds
setTimeout(() => {
  console.log("\n⏱️  Test timeout - exiting");
  process.exit(1);
}, 5000);

