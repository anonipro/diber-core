# DIBER Core

[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/ANONIPRO/diber-core?color=blue)](https://github.com/ANONIPRO/diber-core/releases)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-blue.svg)](https://nodejs.org/)
[![Zero AI Judge](https://img.shields.io/badge/AI--Judge-Zero%20\(Deterministic\)-10b981.svg)](#why-diber)

**Deterministic LLM Audit Engine.**
> **Current release: v0.9.0**

DIBER is a structural evaluation engine for Large Language Model (LLM) outputs.

Instead of relying on a second LLM to judge model responses—which can introduce stochasticity, hallucinations, and evaluator bias—DIBER uses explicit Ground Truth points, human-defined classifications, deterministic weighting, and controlled comparison logic to calculate **reproducible and auditable metrics**.

The same structured inputs always produce the same evaluation report.

## Why DIBER?

* **Zero LLM-as-a-Judge:** Metrics are calculated through deterministic logic and explicit scoring rules. No secondary model is used to judge the output.
* **Reproducible Evaluation:** Same Ground Truth, run metadata, classifications, weights, and context produce the same report.
* **Separation of Concerns:** DIBER separates *Coverage*—whether a point was addressed—from *Status*—how accurately or appropriately it was handled.
* **Context-Aware Evaluation:** Ground Truth points are evaluated according to whether their source documents were actually available to the model.
* **Ground Truth vs. Extra Claims:** Hallucinations tied to expected Ground Truth points are tracked separately from unsupported claims generated outside the Ground Truth.
* **Methodological Comparisons:** DIBER distinguishes replications, single-variable changes, multidimensional comparisons, and indeterminate comparisons.
* **Auditability:** Invalid runs, missing evaluations, unresolved experimental identities, excluded relations, and truncated comparisons remain visible in the final report.
* **CI/CD Ready:** Deterministic metrics can be used to enforce quality gates in automated testing and deployment pipelines.
* **Privacy First:** The core engine runs locally and does not send prompts, responses, Ground Truth data, or evaluation data to external APIs.

## Project Status

DIBER Core is currently in active development.

Version `v0.9.0` is the current public release of the deterministic evaluation engine.

The evaluation methodology is intentionally explicit and inspectable. Feedback, edge cases, implementation issues and methodological criticism are welcome.

## Installation

```bash
npm install @anonipro/diber-core
```

## CLI Usage

### CI/CD Quality Gates

DIBER includes a CLI for evaluating experiments and enforcing deterministic quality thresholds directly in deployment pipelines.

### 1. Generate an Evaluation Report

Calculate metrics by comparing model runs against the Ground Truth:

```bash
npx diber evaluate \
  --truth ./tests/gt.json \
  --evals ./tests/runs.json \
  --out ./report.json
```

### 2. Assert Quality Gates

Fail the CI/CD pipeline if model performance falls outside your defined thresholds:

```bash
npx diber assert \
  --max-hallucination 0.02 \
  --min-quality 0.90 \
  ./report.json
```

If the configured hallucination threshold is exceeded or the required quality threshold is not met, the command exits with a non-zero status code and can block the deployment.

## Programmatic Usage

### Node.js API

DIBER can be integrated directly into Node.js test suites, backend applications, evaluation pipelines, and experiment runners.

```javascript
const {
  buildExperimentReport
} = require('@anonipro/diber-core');

// 1. Define the Ground Truth
const groundTruth = {
  points: [
    /* Expected Ground Truth points */
  ],
  relations: [
    /* Optional semantic relations */
  ]
};

// 2. Define evaluations keyed by run_id
const evaluations = {
  /* Run observations and optional extra_claims */
};

// 3. Define the experiment
const experiment = {
  experiment_id: 'experiment_001',
  runs: [
    /* Model, prompt, input, context, and test metadata */
  ]
};

// 4. Generate the deterministic report
const report = buildExperimentReport({
  experiment,
  groundTruth,
  evaluations
});

// 5. Access calculated metrics
const latestRun = report.runs[0];

console.log(
  `Effective Information: ${latestRun.metrics.effective_information}`
);

console.log(
  `Ground Truth Hallucination Rate: ${latestRun.metrics.gt_hallucination_rate}`
);

console.log(
  `Extra Hallucination Penalty: ${latestRun.metrics.absolute_extra_hallucination_penalty}`
);
```

## Core Evaluation Model

DIBER evaluates each Ground Truth point through two distinct dimensions.

### Coverage

Coverage describes whether the model addressed a Ground Truth point.

Supported coverage states include:

* `addressed`
* `should`
* `gap`
* `out_context`
* `not_relevant`
* `unrated`

Only points that are both materially eligible and available to the model enter the relevant metric denominators.

### Status

Status describes how the model handled an evaluated point.

Supported status values include:

* `correct`
* `partial`
* `inference`
* `over`
* `error`
* `math_error`
* `hallu`
* `omission`
* `missing`
* `na`
* `unrated`

Coverage and status are intentionally kept separate so that missing content, incorrect content, unsupported content, and incomplete content are not collapsed into a single score.

## Core Metrics

DIBER calculates multiple metrics instead of reducing the evaluation to one opaque score.

### Coverage

* **Raw Coverage:** Fraction of eligible Ground Truth points that were addressed.
* **Weighted Coverage:** Coverage adjusted by Ground Truth importance weights.

### Quality

* **Quality:** Weighted quality across eligible Ground Truth points.
* **Addressed Quality:** Quality calculated only across points the model actually addressed.

### Information Metrics

* **Usable Information:** Fraction of addressed information classified as `correct` or `partial`.
* **Effective Information:** Combines coverage and status quality across eligible Ground Truth points.

### Defect Rates

DIBER reports explicit failure rates, including:

* `omission_rate`
* `error_rate`
* `math_error_rate`
* `gt_hallucination_rate`
* `over_rate`
* `inference_rate`

These metrics are calculated against eligible Ground Truth points available to the model.

## Ground Truth Hallucinations vs. Extra Claims

DIBER distinguishes between two different failure classes.

### Ground Truth Hallucinations

`gt_hallucination_rate` measures hallucination classifications attached to expected Ground Truth points.

These failures are directly tied to information that exists in the evaluation structure.

### Extra Claims

Some model-generated claims do not correspond to any Ground Truth point.

DIBER stores these separately in `extra_claims`.

Supported extra-claim classifications include:

* `hallu`
* `over`
* `error`

The engine exposes:

* `extra_claims_count`
* `extra_hallucination_count`
* `extra_over_count`
* `extra_error_count`
* `absolute_extra_hallucination_penalty`
* `absolute_extra_claim_penalty`

Ground Truth quality and extra-claim penalties remain intentionally separate so that different failure modes remain visible and auditable.

## Context-Aware Evaluation

DIBER tracks which documents were actually available to the model during each run.

Each normalized Ground Truth point includes:

* `available_to_model`
* `metric_eligible`

A point becomes metric-eligible only when it is available to the model and belongs to an eligible coverage state.

This prevents unavailable source material from being incorrectly treated as a standard model omission or failure.

## Relation Consistency

Ground Truth points can define semantic relations such as:

* `supports`
* `depends_on`
* `contradicts`

DIBER evaluates whether the resulting classifications remain logically consistent.

For example:

* a failed or hallucinated premise cannot validly support a dependent conclusion;
* a valid conclusion cannot depend on a failed fundamental premise;
* two mutually contradictory points cannot both be treated as simultaneously valid.

Relations that cannot be meaningfully evaluated are excluded from the consistency denominator rather than automatically counted as successful.

The report exposes:

* `relation_count`
* `relation_consistency`
* `relation_consistent_count`
* `relation_evaluated_count`
* `relation_excluded_count`

## Experimental Comparisons

DIBER compares runs while tracking experimental identity across:

* model
* prompt
* input
* context

Comparison methodology is classified as:

* `replication`
* `single_variable_change`
* `multidimensional`
* `indeterminate`

A comparison is considered controlled only when the relevant experimental identities are known and the run pair represents either a replication or a single-variable change.

Unknown identities are not silently treated as equivalent.

## Deterministic Experiment Identity

DIBER can derive stable identities for:

* prompts
* inputs
* contexts
* exact experimental configurations

The engine uses deterministic serialization and hashing for identity generation when explicit IDs are unavailable.

Context identity can also incorporate document identifiers, versions, content hashes, or document content when available.

This helps prevent two technically different experimental configurations from being incorrectly grouped together.

## Repeated Runs and Statistics

Repeated runs with the same known experimental configuration can be grouped and statistically aggregated.

DIBER calculates:

* sample count
* mean
* minimum
* maximum
* range
* standard deviation
* 95% confidence interval

For smaller samples, DIBER uses Student's t critical values.

For larger samples, it uses a normal approximation.

Metrics naturally bounded between `0` and `1` retain bounded confidence intervals.

## Audit Trail

The final report preserves evaluation integrity information instead of silently dropping problematic runs.

The audit section includes:

* requested runs
* valid runs
* invalid runs
* missing evaluations
* unresolved configuration identities
* scanned comparison pairs
* generated comparisons
* comparison truncation state
* comparison truncation reason

Invalid runs and missing evaluations remain accessible in the report for debugging and traceability.

## Comparison Scaling

Pairwise comparison can grow rapidly as the number of experiment runs increases.

DIBER supports comparison limits through:

* `maxComparisons`
* `maxScannedPairs`
* `includeMultidimensional`
* `includeIndeterminate`

Example:

```javascript
const report = buildExperimentReport({
  experiment,
  groundTruth,
  evaluations,
  options: {
    comparisons: {
      maxComparisons: 500,
      maxScannedPairs: 5000,
      includeMultidimensional: false,
      includeIndeterminate: false
    }
  }
});
```

The report records whether comparison generation was truncated and why.

## Report Structure

A DIBER experiment report includes:

```text
report
├── schema
├── engine_version
├── deterministic
├── ai_judge
├── experiment_id
├── audit
├── run_count
├── runs
│   └── [0] (Single Run)
│       ├── metrics (Quality, Coverage, Errors)
│       ├── profile (Structured execution profile)
│       ├── normalized (Ground Truth evaluations)
│       ├── extra_claims (Unsupported extra claims)
│       └── relations (Logical consistency analysis)
├── invalid_runs
├── missing_evaluations
├── unresolved_configuration_runs
├── comparisons
├── groups
│   ├── models
│   ├── prompts
│   ├── contexts
│   └── exact_configurations
└── matrix
```

Each valid run includes normalized Ground Truth evaluations, extra claims, relation analysis, metrics, and a structured execution profile.

## Runtime Compatibility

DIBER Core supports:

* **Node.js / CommonJS**
* **Web Browsers** through `window.DIBERCore`

Example in a browser:

```javascript
const report = window.DIBERCore.buildExperimentReport({
  experiment,
  groundTruth,
  evaluations
});
```

## Design Philosophy

DIBER intentionally avoids collapsing every failure mode into a single global score.

Coverage, Ground Truth quality, omissions, hallucinations, mathematical errors, unsupported claims, logical consistency, and input exposure describe different properties of an LLM response.

Keeping them separate makes evaluation results easier to inspect, reproduce, compare, and audit.

## License

MIT License.
