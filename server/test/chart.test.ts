/**
 * Chart <-> server drift. The Helm chart is the only thing that sets RUNNER_*,
 * and the server is the only thing that reads it — so a rename on either side
 * is invisible at runtime (the value is simply ignored and the default silently
 * wins). This test makes that a build failure instead.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { podManifest } from "@stepaway/core";
import { RUNNER_ENV_NAMES, loadConfig } from "../src/config.js";

const CHART = new URL("../../charts/stepaway/", import.meta.url);
const deployment = readFileSync(new URL("templates/deployment.yaml", CHART), "utf8");
const values = readFileSync(new URL("values.yaml", CHART), "utf8");

describe("chart env contract", () => {
  test("the Deployment sets exactly the RUNNER_* names the server reads", () => {
    const inChart = new Set([...deployment.matchAll(/^\s*- name: (RUNNER_[A-Z0-9_]+)/gm)].map((m) => m[1]));
    expect([...inChart].sort()).toEqual([...RUNNER_ENV_NAMES].sort());
  });

  test("every RUNNER_* name actually reaches the runner overrides", () => {
    const env = Object.fromEntries(RUNNER_ENV_NAMES.map((n) => [n, n === "RUNNER_DIND_ENABLED" ? "false" : `v-${n}`]));
    const runner = loadConfig(env).runner;
    expect(runner).toEqual({
      image: "v-RUNNER_IMAGE",
      cpuRequest: "v-RUNNER_CPU_REQUEST",
      memoryRequest: "v-RUNNER_MEMORY_REQUEST",
      memoryLimit: "v-RUNNER_MEMORY_LIMIT",
      storageClass: "v-RUNNER_STORAGE_CLASS",
      storageSize: "v-RUNNER_STORAGE_SIZE",
      dindEnabled: false,
    });
  });

  test("values.yaml still carries the keys the template dereferences", () => {
    for (const key of ["memRequest:", "memLimit:", "cpuRequest:", "storageClass:", "pvc:", "size:", "dind:"]) {
      expect(values).toContain(key);
    }
  });
});

describe("runner.dind.enabled", () => {
  test("default keeps the privileged dind sidecar", () => {
    const yaml = podManifest({ name: "stepaway-1", sessionId: "s" });
    expect(yaml).toContain("- name: dind");
    expect(yaml).toContain("privileged: true");
    expect(yaml).toContain("- name: dind-storage");
  });

  test("false drops the sidecar and its volume, and nothing else", () => {
    const yaml = podManifest({ name: "stepaway-1", sessionId: "s", dindEnabled: false });
    expect(yaml).not.toContain("- name: dind");
    expect(yaml).not.toContain("privileged");
    expect(yaml).not.toContain("dind-storage");
    // the runner container and its volumes survive intact
    expect(yaml).toContain("- name: runner");
    expect(yaml).toContain("claimName: stepaway-1");
    expect(yaml).toMatch(/volumes:\n {4}- name: work\n {6}emptyDir: \{\}\n {4}- name: repo\n/);
  });

  test('RUNNER_DIND_ENABLED="false" is the only thing that turns it off', () => {
    expect(loadConfig({ RUNNER_DIND_ENABLED: "false" }).runner.dindEnabled).toBe(false);
    expect(loadConfig({ RUNNER_DIND_ENABLED: "true" }).runner.dindEnabled).toBe(true);
    expect(loadConfig({}).runner.dindEnabled).toBeUndefined();
  });
});
