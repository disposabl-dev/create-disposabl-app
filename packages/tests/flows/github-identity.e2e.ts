import { test, expect } from "e2e";
import { throws } from "node:assert/strict";
import { workflowRepository } from "../../backend/convex/github/actions/oidc.ts";

test(
  "GitHub reports accept repository casing and preserve workflow boundaries",
  { platforms: ["backend"] },
  async () => {
    const repository = "MixedCaseOwner/Example-App";
    const path = ".github/workflows/pipeline.yml";
    const ref = "refs/heads/main";
    const workflow = `${repository}/${path}@${ref}`;
    const claims = {
      repository,
      ref,
      workflow_ref: workflow,
      job_workflow_ref: workflow,
    };
    const linked = repository.toLowerCase();
    expect(workflowRepository(claims, linked, path)).toBe(repository);
    expect(
      workflowRepository({ ...claims, job_workflow_ref: "" }, linked, path),
    ).toBe(repository);
    for (const altered of [
      { repository: "OtherOwner/Example-App" },
      { repository: `${repository}-other` },
      { workflow_ref: `${repository}/.github/workflows/other.yml@${ref}` },
      { workflow_ref: `${repository}/.github/workflows/Pipeline.yml@${ref}` },
      { workflow_ref: `${repository}/${path}@refs/heads/Main` },
      { job_workflow_ref: `OtherOwner/Example-App/${path}@${ref}` },
    ]) {
      throws(
        () => workflowRepository({ ...claims, ...altered }, linked, path),
        { message: "Unexpected workflow." },
      );
    }
  },
);
