import assert from "node:assert/strict";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  DEFAULT_TOOLCRAFT_PORT,
  LOOPBACK_HOST_UNSUPPORTED,
  LOOPBACK_PORT_AVAILABLE,
  LOOPBACK_PORT_TAKEN,
  findAvailablePort,
  getListeningProcessIds,
  killListeningProcessesOnPort,
  readToolcraftAppIdentityFromHtml,
  probeLoopbackPort,
  readSavedToolcraftPort,
  resolveLoopbackAvailability,
  waitForToolcraftAppOnPort,
  writeSavedToolcraftPort,
} from "./toolcraft-port.mjs";

function listen(host) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once("error", reject);
    server.listen({ host, port: 0 }, () => {
      resolve(server);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

test("findAvailablePort skips ports occupied on IPv6 localhost", async (t) => {
  let server;

  try {
    server = await listen("::1");
  } catch (error) {
    if (error?.code === "EAFNOSUPPORT" || error?.code === "EADDRNOTAVAIL") {
      t.skip("IPv6 localhost is not available in this environment.");
      return;
    }

    throw error;
  }

  t.after(() => close(server));

  const address = server.address();
  assert.equal(typeof address, "object");

  const selectedPort = await findAvailablePort(address.port);

  assert.notEqual(
    selectedPort,
    address.port,
    "A port occupied on ::1 must be treated as unavailable for localhost URLs.",
  );
});

test("findAvailablePort skips ports occupied on IPv4 localhost", async (t) => {
  const server = await listen("127.0.0.1");
  t.after(() => close(server));

  const address = server.address();
  assert.equal(typeof address, "object");

  const selectedPort = await findAvailablePort(address.port);

  assert.notEqual(
    selectedPort,
    address.port,
    "A port occupied on 127.0.0.1 must be treated as unavailable for localhost URLs.",
  );
});

// 192.0.2.1 is TEST-NET-1 from RFC 5737, which is guaranteed never to be
// assigned, so binding it fails for the same reason ::1 fails on a machine
// with no IPv6 stack.
test("probeLoopbackPort separates an unbindable host from a busy port", async () => {
  assert.equal(
    await probeLoopbackPort(0, "192.0.2.1"),
    LOOPBACK_HOST_UNSUPPORTED,
    "A host whose address cannot be bound at all is not evidence that a port is taken.",
  );
});

test("probeLoopbackPort reports a port held by another listener as taken", async (t) => {
  const server = await listen("127.0.0.1");
  t.after(() => close(server));

  assert.equal(
    await probeLoopbackPort(server.address().port, "127.0.0.1"),
    LOOPBACK_PORT_TAKEN,
  );
});

test("resolveLoopbackAvailability ignores a loopback host this machine cannot bind", () => {
  assert.equal(
    resolveLoopbackAvailability([LOOPBACK_PORT_AVAILABLE, LOOPBACK_HOST_UNSUPPORTED]),
    true,
    "A missing IPv6 stack must not make every port look occupied.",
  );
});

test("resolveLoopbackAvailability still rejects a port taken on a bindable host", () => {
  assert.equal(
    resolveLoopbackAvailability([LOOPBACK_PORT_TAKEN, LOOPBACK_HOST_UNSUPPORTED]),
    false,
  );
  assert.equal(
    resolveLoopbackAvailability([LOOPBACK_PORT_AVAILABLE, LOOPBACK_PORT_TAKEN]),
    false,
  );
});

test("resolveLoopbackAvailability fails loudly when no loopback host can be bound", () => {
  assert.throws(
    () =>
      resolveLoopbackAvailability([
        LOOPBACK_HOST_UNSUPPORTED,
        LOOPBACK_HOST_UNSUPPORTED,
      ]),
    /No loopback host of .* can be bound on this machine/,
    "A machine with no loopback stack must say so rather than report every port busy.",
  );
});

// The original failure: on an IPv4-only host ::1 reported EAFNOSUPPORT for
// every port, so this scanned to 65535 and threw "No free port found at or
// above 3002", which reads as a machine with 62533 busy ports.
test("findAvailablePort resolves a port when one loopback family is missing", async () => {
  const port = await findAvailablePort(DEFAULT_TOOLCRAFT_PORT);

  assert.equal(Number.isInteger(port), true);
  assert.equal(port >= DEFAULT_TOOLCRAFT_PORT && port <= 65_535, true);
});

test("saved Toolcraft port round-trips through local project state", async (t) => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "toolcraft-port-"));
  t.after(() => fs.rm(cwd, { force: true, recursive: true }));

  assert.equal(await readSavedToolcraftPort(cwd), null);

  await writeSavedToolcraftPort(4123, cwd);

  assert.equal(await readSavedToolcraftPort(cwd), 4123);
});

test("getListeningProcessIds parses unique listening process ids", async () => {
  const pids = await getListeningProcessIds(4123, async () => ({
    stderr: "",
    stdout: "123\n456\n123\nnot-a-pid\n",
  }));

  assert.deepEqual(pids, [123, 456]);
});

test("killListeningProcessesOnPort targets listeners found on the port", async () => {
  const killed = [];
  const pids = await killListeningProcessesOnPort(4123, {
    execFileImpl: async () => ({ stderr: "", stdout: "123\n456\n" }),
    killProcess: (pid, signal) => {
      killed.push({ pid, signal });
    },
  });

  assert.deepEqual(pids, [123, 456]);
  assert.deepEqual(killed, [
    { pid: 123, signal: "SIGTERM" },
    { pid: 456, signal: "SIGTERM" },
  ]);
});

test("killListeningProcessesOnPort supports forced restart cleanup", async () => {
  const killed = [];
  const pids = await killListeningProcessesOnPort(4123, {
    execFileImpl: async () => ({ stderr: "", stdout: "789\n" }),
    killProcess: (pid, signal) => {
      killed.push({ pid, signal });
    },
    signal: "SIGKILL",
  });

  assert.deepEqual(pids, [789]);
  assert.deepEqual(killed, [{ pid: 789, signal: "SIGKILL" }]);
});

test("readToolcraftAppIdentityFromHtml prefers the app title meta marker", () => {
  assert.deepEqual(
    readToolcraftAppIdentityFromHtml(`
      <html>
        <head>
          <meta name="toolcraft-app-title" content="Generated App" />
          <title>Other Title</title>
        </head>
      </html>
    `),
    {
      appTitle: "Generated App",
      title: "Other Title",
    },
  );
});

test("waitForToolcraftAppOnPort accepts the current app identity", async (t) => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "toolcraft-port-identity-"));
  t.after(() => fs.rm(cwd, { force: true, recursive: true }));
  await fs.writeFile(
    path.join(cwd, "index.html"),
    '<meta name="toolcraft-app-title" content="Current App" /><title>Current App</title>',
  );
  const currentRoot = await fs.realpath(cwd);

  const result = await waitForToolcraftAppOnPort(4321, {
    cwd,
    fetchImpl: async () => ({
      ok: true,
      text: async () => JSON.stringify({ appTitle: "Current App", root: currentRoot }),
    }),
    timeoutMs: 1,
  });

  assert.equal(result.url, "http://127.0.0.1:4321/");
});

test("waitForToolcraftAppOnPort verifies the current project root when the server identity endpoint exists", async (t) => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "toolcraft-port-root-"));
  t.after(() => fs.rm(cwd, { force: true, recursive: true }));
  await fs.writeFile(
    path.join(cwd, "index.html"),
    '<meta name="toolcraft-app-title" content="Current App" /><title>Current App</title>',
  );
  const currentRoot = await fs.realpath(cwd);

  const result = await waitForToolcraftAppOnPort(4321, {
    cwd,
    fetchImpl: async (url) => ({
      ok: true,
      text: async () =>
        String(url).includes("/.toolcraft/server-identity.json")
          ? JSON.stringify({ appTitle: "Current App", root: currentRoot })
          : '<meta name="toolcraft-app-title" content="Different App" /><title>Different App</title>',
    }),
    timeoutMs: 1,
  });

  assert.equal(result.url, "http://127.0.0.1:4321/");
});

test("waitForToolcraftAppOnPort checks IPv6 localhost when IPv4 does not respond", async (t) => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "toolcraft-port-ipv6-"));
  t.after(() => fs.rm(cwd, { force: true, recursive: true }));
  await fs.writeFile(
    path.join(cwd, "index.html"),
    '<meta name="toolcraft-app-title" content="Current App" /><title>Current App</title>',
  );
  const currentRoot = await fs.realpath(cwd);

  const result = await waitForToolcraftAppOnPort(4321, {
    cwd,
    fetchImpl: async (url) => {
      if (String(url).startsWith("http://127.0.0.1:4321")) {
        throw new Error("fetch failed");
      }

      return {
        ok: true,
        text: async () =>
          String(url).includes("/.toolcraft/server-identity.json")
            ? JSON.stringify({ appTitle: "Current App", root: currentRoot })
            : '<meta name="toolcraft-app-title" content="Current App" /><title>Current App</title>',
      };
    },
    timeoutMs: 1,
  });

  assert.equal(result.url, "http://[::1]:4321/");
});

test("waitForToolcraftAppOnPort rejects a port serving another app", async (t) => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "toolcraft-port-foreign-"));
  t.after(() => fs.rm(cwd, { force: true, recursive: true }));
  await fs.writeFile(
    path.join(cwd, "index.html"),
    '<meta name="toolcraft-app-title" content="Current App" /><title>Current App</title>',
  );
  const otherRoot = await fs.mkdtemp(path.join(os.tmpdir(), "toolcraft-port-foreign-root-"));
  t.after(() => fs.rm(otherRoot, { force: true, recursive: true }));
  const otherRealRoot = await fs.realpath(otherRoot);

  await assert.rejects(
    () =>
      waitForToolcraftAppOnPort(4321, {
        cwd,
        fetchImpl: async () => ({
          ok: true,
          text: async () => JSON.stringify({ appTitle: "Different App", root: otherRealRoot }),
        }),
        timeoutMs: 1,
      }),
    /Port 4321 is serving Different App at .* instead of this app Current App at /,
  );
});

test("waitForToolcraftAppOnPort rejects a matching title from a different project root", async (t) => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "toolcraft-port-root-current-"));
  const otherRoot = await fs.mkdtemp(path.join(os.tmpdir(), "toolcraft-port-root-other-"));
  t.after(() => fs.rm(cwd, { force: true, recursive: true }));
  t.after(() => fs.rm(otherRoot, { force: true, recursive: true }));
  await fs.writeFile(
    path.join(cwd, "index.html"),
    '<meta name="toolcraft-app-title" content="Current App" /><title>Current App</title>',
  );
  const otherRealRoot = await fs.realpath(otherRoot);

  await assert.rejects(
    () =>
      waitForToolcraftAppOnPort(4321, {
        cwd,
        fetchImpl: async (url) => ({
          ok: true,
          text: async () =>
            String(url).includes("/.toolcraft/server-identity.json")
              ? JSON.stringify({ appTitle: "Current App", root: otherRealRoot })
              : '<meta name="toolcraft-app-title" content="Current App" /><title>Current App</title>',
        }),
        timeoutMs: 1,
      }),
    /Port 4321 is serving Current App at .* instead of this app Current App at /,
  );
});
