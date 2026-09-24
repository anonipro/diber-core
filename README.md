# DIBER Core

[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/ANONIPRO/diber-core?color=blue)](https://github.com/ANONIPRO/diber-core/releases)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-blue.svg)](https://nodejs.org/)
[![Zero AI Judge](https://img.shields.io/badge/AI--Judge-Zero%20(Deterministic)-10b981.svg)](#why-diber)

**Deterministic LLM Audit Engine.**

DIBER is a structural evaluation engine for Large Language Model (LLM) outputs.

Instead of relying on a second LLM to judge outputs—which introduces stochasticity, hallucinations, and bias—DIBER uses explicit, human-defined Ground Truths and classifications to calculate **reproducible, auditable metrics**.

## Why DIBER?

* **Zero LLM-as-a-Judge:** Metrics are calculated purely through deterministic math based on structured inputs. Same inputs, same weights = exact same report.
* **Separation of Concerns:** DIBER separates *Coverage* (did the model address the point?) from *Status* (how well did it address it?).
* **CI/CD Ready:** Apply strict thresholds, such as maximum hallucination rate or minimum quality, to block deployments automatically.
* **Context-Aware (RAG):** Automatically detects if a required fact was missing from the provided context documents, separating model hallucinations from retrieval failures.
* **Privacy First:** The engine runs entirely locally. It doesn't send your prompts or responses to external APIs.

## Installation

```bash
npm install @anonipro/diber-core
```

## CLI Usage

### CI/CD Quality Gates

DIBER includes a built-in CLI to evaluate experiments and enforce quality thresholds directly in your deployment pipelines.

### 1. Generate an Evaluation Report

Calculate metrics by comparing your run data against the Ground Truth:

```bash
npx diber evaluate \
  --truth ./tests/gt.json \
  --evals ./tests/runs.json \
  --out ./report.json
```

### 2. Assert Quality Gates

Fail the CI/CD pipeline if the model's performance drops below your defined thresholds:

```bash
npx diber assert \
  --max-hallucination 0.02 \
  --min-quality 0.90 \
  ./report.json
```

If the hallucination rate exceeds **2%** or the addressed quality falls below **90%**, the command exits with a non-zero status code, blocking the deployment.

## Programmatic Usage

### Node.js API

You can integrate DIBER directly into your Node.js test suites or backend applications.

```javascript
import { buildExperimentReport } from '@anonipro/diber-core';

// 1. Define your inputs
const groundTruth = {
  /* Your expected points and relations */
};

const evaluations = {
  /* Your run observations */
};

const experiment = {
  /* Your model and prompt metadata */
};

// 2. Generate the deterministic report
const report = buildExperimentReport({
  experiment,
  groundTruth,
  evaluations
});

// 3. Access calculated metrics
const latestRun = report.runs[0];

console.log(
  `Effective Information: ${latestRun.metrics.effective_information}`
);

console.log(
  `Hallucination Rate: ${latestRun.metrics.hallucination_rate}`
);
```

## Core Metrics

DIBER calculates highly specific metrics that don't obscure failures:

* **Coverage (Weighted):** How much of the materially necessary content was addressed.
* **Addressed Quality:** The accuracy of the points the model actually chose to talk about.
* **Effective Information:** A combined metric of coverage and quality.
* **Defect Rates:** Explicit calculation of:

  * `hallucination_rate`
  * `omission_rate`
  * `error_rate`
  * `math_error_rate`

  Each rate is calculated against its relevant denominator.
* **Relation Consistency:** Verifies logical dependencies. For example, if a conclusion is classified as `"correct"` but relies on a premise classified as a `"hallucination"`, the relation fails.

## License

MIT License.
