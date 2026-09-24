/* ============================================================
   DIBER Core — EVALUATION ENGINE
   Version: 0.9.0
   Real-World Context, Methodological Validity, Statistics
   Language: JavaScript (Compatible with Node.js and Web Browsers)
   Type: Deterministic / No AI-as-a-judge

   ARCHITECTURAL PRINCIPLE:

   INPUT (JSON Data)
     ↓
   VALIDATION (Structural integrity)
     ↓
   NORMALIZATION (Validation of the actual context available to the model)
     ↓
   PRIMITIVE METRICS (Basic counts and weights)
     ↓
   DERIVED METRICS (Quality, Coverage, Error Rates)
     ↓
   RELATIONSHIP ANALYSIS (Logical and semantic consistency)
     ↓
   RUN COMPARISON (Methodological validation of variables)
     ↓
   STRUCTURED REPORT (Including statistical variability across multiple runs)
   ============================================================ */


/* ============================================================
   1. BASE CONFIGURATION
   ============================================================ */

   const CB_CONFIG = {
    version: "0.9.0",

    coverage: {
        addressed: true,
        should: true,
        gap: true,
        out_context: true,
        not_relevant: true,
        unrated: true
    },

    status: {
        correct: true,
        partial: true,
        omission: true,
        inference: true,
        over: true,
        error: true,
        math_error: true,
        hallu: true,
        missing: true,
        na: true,
        unrated: true
    },

    relationTypes: {
        supports: true,
        depends_on: true,
        contradicts: true
    },

    extraClaimStatus: {
        hallu: true,
        over: true,
        error: true
    },

    defaultImportanceWeight: {
        Critical: 2.00,
        High: 1.00,
        Medium: 0.50,
        Low: 0.25,
        undefined: 1.00
    },

    statusScore: {
        correct: 1.00,
        partial: 0.50,
        inference: 0.25,
        over: 0.25,
        error: 0.00,
        math_error: 0.00,
        hallu: 0.00,
        omission: 0.00,
        missing: 0.00,
        na: null,
        unrated: null
    },

    coverageScore: {
        addressed: 1.00,
        should: 0.00,
        gap: null,
        out_context: null,
        not_relevant: null,
        unrated: null
    }
};


/* ============================================================
   2. UTILITIES & STATISTICS
   ============================================================ */

function safeDivide(a, b) {
    if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) {
        return null;
    }
    return a / b;
}

function sum(values) {
    return values.reduce(
        (acc, value) => acc + (Number.isFinite(value) ? value : 0),
        0
    );
}

function stableSerialize(value) {
    if (value === undefined) {
        return '"__undefined__"';
    }

    if (value === null) {
        return "null";
    }

    if (typeof value === "number") {
        if (Number.isNaN(value)) return '"__NaN__"';
        if (!Number.isFinite(value)) {
            return JSON.stringify(String(value));
        }
        return String(value);
    }

    if (
        typeof value === "string" ||
        typeof value === "boolean"
    ) {
        return JSON.stringify(value);
    }

    if (Array.isArray(value)) {
        return `[${value.map(stableSerialize).join(",")}]`;
    }

    if (typeof value === "object") {
        const keys = Object.keys(value).sort();

        return `{${keys
            .map(
                key =>
                    `${JSON.stringify(key)}:${stableSerialize(value[key])}`
            )
            .join(",")}}`;
    }

    return JSON.stringify(String(value));
}

/*
 * Deterministic non-cryptographic FNV-1a hash.
 * Used only for stable experiment identities, not for security.
 */
function stableHash(value) {
    const input = stableSerialize(value);
    let hash = 0x811c9dc5;

    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }

    return (hash >>> 0).toString(16).padStart(8, "0");
}

function deriveStableId(prefix, value) {
    if (value === undefined || value === null || value === "") {
        return null;
    }

    return `${prefix}_${stableHash(value)}`;
}

function canonicalArray(values) {
    if (!Array.isArray(values)) {
        return [];
    }

    return [...values].sort((a, b) =>
        stableSerialize(a).localeCompare(stableSerialize(b))
    );
}

function isValidNonNegativeNumber(value) {
    if (value === null || value === undefined) {
        return false;
    }

    if (typeof value === "string" && value.trim() === "") {
        return false;
    }

    const numeric = Number(value);

    return Number.isFinite(numeric) && numeric >= 0;
}

/*
 * 95% Student-t critical values.
 * For df > 30, the normal approximation is sufficiently close
 * for the purposes of this evaluation engine.
 */
function get95PercentCriticalValue(df) {
    const table = {
        1: 12.706,
        2: 4.303,
        3: 3.182,
        4: 2.776,
        5: 2.571,
        6: 2.447,
        7: 2.365,
        8: 2.306,
        9: 2.262,
        10: 2.228,
        11: 2.201,
        12: 2.179,
        13: 2.160,
        14: 2.145,
        15: 2.131,
        16: 2.120,
        17: 2.110,
        18: 2.101,
        19: 2.093,
        20: 2.086,
        21: 2.080,
        22: 2.074,
        23: 2.069,
        24: 2.064,
        25: 2.060,
        26: 2.056,
        27: 2.052,
        28: 2.048,
        29: 2.045,
        30: 2.042
    };

    return table[df] ?? 1.96;
}

function calculateStats(
    values,
    { minBound = null, maxBound = null } = {}
) {
    const valid = values.filter(value => Number.isFinite(value));
    const n = valid.length;

    if (n === 0) {
        return {
            n: 0,
            mean: null,
            min: null,
            max: null,
            range: null,
            stddev: null,
            ci_lower: null,
            ci_upper: null,
            ci_method: null
        };
    }

    const mean = sum(valid) / n;
    const min = Math.min(...valid);
    const max = Math.max(...valid);
    const range = max - min;

    let variance = 0;

    if (n > 1) {
        variance =
            valid.reduce(
                (acc, value) => acc + Math.pow(value - mean, 2),
                0
            ) /
            (n - 1);
    }

    const stddev = Math.sqrt(variance);

    let ciLower = null;
    let ciUpper = null;
    let ciMethod = null;

    if (n > 1) {
        const standardError = stddev / Math.sqrt(n);
        const critical = get95PercentCriticalValue(n - 1);
        const marginOfError = critical * standardError;

        ciLower = mean - marginOfError;
        ciUpper = mean + marginOfError;
        ciMethod = n <= 31
            ? "student_t_95"
            : "normal_approximation_95";

        if (Number.isFinite(minBound)) {
            ciLower = Math.max(minBound, ciLower);
        }

        if (Number.isFinite(maxBound)) {
            ciUpper = Math.min(maxBound, ciUpper);
        }
    }

    return {
        n,
        mean,
        min,
        max,
        range,
        stddev,
        ci_lower: ciLower,
        ci_upper: ciUpper,
        ci_method: ciMethod
    };
}


/* ============================================================
   3. IMPORTANCE NORMALIZATION
   ============================================================ */

function getImportanceWeight(point) {
    if (
        point &&
        point.weight !== undefined &&
        point.weight !== null &&
        isValidNonNegativeNumber(point.weight)
    ) {
        return Number(point.weight);
    }

    if (!point || !point.importance) {
        return CB_CONFIG.defaultImportanceWeight.undefined;
    }

    return (
        CB_CONFIG.defaultImportanceWeight[point.importance] ??
        CB_CONFIG.defaultImportanceWeight.undefined
    );
}


/* ============================================================
   4. STRUCTURAL VALIDATION
   ============================================================ */

function validateRunDefinition(run) {
    const errors = [];
    const warnings = [];

    if (!run || typeof run !== "object") {
        return {
            valid: false,
            errors: ["run_missing_or_invalid"],
            warnings
        };
    }

    if (
        run.run_id === undefined ||
        run.run_id === null ||
        run.run_id === ""
    ) {
        errors.push("run_id_missing");
    }

    if (
        run.context_document_ids !== undefined &&
        !Array.isArray(run.context_document_ids)
    ) {
        errors.push("context_document_ids_not_array");
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}

function validateEvaluation(evaluation, groundTruth) {
    const errors = [];
    const warnings = [];

    if (!evaluation) {
        return {
            valid: false,
            errors: ["evaluation_missing"],
            warnings
        };
    }

    if (!groundTruth) {
        return {
            valid: false,
            errors: ["ground_truth_missing"],
            warnings
        };
    }

    if (!Array.isArray(evaluation.evaluations)) {
        errors.push("evaluations_not_array");
    }

    if (
        evaluation.extra_claims !== undefined &&
        evaluation.extra_claims !== null &&
        !Array.isArray(evaluation.extra_claims)
    ) {
        errors.push("extra_claims_not_array");
    }

    if (!Array.isArray(groundTruth.points)) {
        errors.push("ground_truth_points_not_array");
    }

    if (
        groundTruth.relations !== undefined &&
        groundTruth.relations !== null &&
        !Array.isArray(groundTruth.relations)
    ) {
        errors.push("ground_truth_relations_not_array");
    }

    if (errors.length) {
        return {
            valid: false,
            errors,
            warnings
        };
    }

    const groundTruthIds = groundTruth.points.map(
        point => point?.point_id
    );

    const duplicateGroundTruthIds = groundTruthIds.filter(
        (id, index) => groundTruthIds.indexOf(id) !== index
    );

    if (duplicateGroundTruthIds.length) {
        errors.push({
            type: "duplicate_ground_truth_point_ids",
            ids: [...new Set(duplicateGroundTruthIds)]
        });
    }

    const expectedIdSet = new Set();

    groundTruth.points.forEach((point, index) => {
        if (
            !point ||
            point.point_id === undefined ||
            point.point_id === null ||
            point.point_id === ""
        ) {
            errors.push({
                type: "invalid_ground_truth_point_id",
                index
            });
            return;
        }

        expectedIdSet.add(point.point_id);

        if (
            point.weight !== undefined &&
            point.weight !== null &&
            !isValidNonNegativeNumber(point.weight)
        ) {
            errors.push({
                type: "invalid_ground_truth_weight",
                point_id: point.point_id,
                value: point.weight
            });
        }

        if (
            point.importance &&
            point.weight === undefined &&
            CB_CONFIG.defaultImportanceWeight[point.importance] === undefined
        ) {
            warnings.push({
                type: "unknown_importance_label",
                point_id: point.point_id,
                value: point.importance
            });
        }
    });

    const receivedIds = [];

    evaluation.evaluations.forEach((item, index) => {
        if (!item || typeof item !== "object") {
            errors.push({
                type: "invalid_evaluation_item",
                index
            });
            return;
        }

        if (
            item.point_id === undefined ||
            item.point_id === null ||
            item.point_id === ""
        ) {
            errors.push({
                type: "missing_evaluation_point_id",
                index
            });
            return;
        }

        receivedIds.push(item.point_id);

        if (
            item.coverage !== undefined &&
            item.coverage !== null &&
            CB_CONFIG.coverage[item.coverage] !== true
        ) {
            errors.push({
                type: "invalid_coverage",
                point_id: item.point_id,
                value: item.coverage
            });
        }

        if (
            item.status !== undefined &&
            item.status !== null &&
            CB_CONFIG.status[item.status] !== true
        ) {
            errors.push({
                type: "invalid_status",
                point_id: item.point_id,
                value: item.status
            });
        }
    });

    const duplicates = receivedIds.filter(
        (id, index) => receivedIds.indexOf(id) !== index
    );

    if (duplicates.length) {
        errors.push({
            type: "duplicate_point_ids",
            ids: [...new Set(duplicates)]
        });
    }

    const missing = [...expectedIdSet].filter(
        id => !receivedIds.includes(id)
    );

    if (missing.length) {
        errors.push({
            type: "missing_point_ids",
            ids: missing
        });
    }

    const unknown = receivedIds.filter(
        id => !expectedIdSet.has(id)
    );

    if (unknown.length) {
        errors.push({
            type: "unknown_point_ids",
            ids: [...new Set(unknown)]
        });
    }

    const relations = groundTruth.relations || [];

    relations.forEach((relation, index) => {
        if (!relation || typeof relation !== "object") {
            errors.push({
                type: "invalid_relation",
                index
            });
            return;
        }

        if (CB_CONFIG.relationTypes[relation.type] !== true) {
            errors.push({
                type: "unknown_relation_type",
                index,
                value: relation.type
            });
        }

        if (!expectedIdSet.has(relation.source_point_id)) {
            errors.push({
                type: "unknown_relation_source",
                index,
                point_id: relation.source_point_id
            });
        }

        if (!expectedIdSet.has(relation.target_point_id)) {
            errors.push({
                type: "unknown_relation_target",
                index,
                point_id: relation.target_point_id
            });
        }
    });

    const extraClaims = evaluation.extra_claims || [];
    const explicitExtraClaimIds = [];

    extraClaims.forEach((claim, index) => {
        if (!claim || typeof claim !== "object") {
            errors.push({
                type: "invalid_extra_claim",
                index
            });
            return;
        }

        if (
            claim.claim_id !== undefined &&
            claim.claim_id !== null &&
            claim.claim_id !== ""
        ) {
            explicitExtraClaimIds.push(claim.claim_id);
        }

        if (
            claim.status !== undefined &&
            claim.status !== null &&
            CB_CONFIG.extraClaimStatus[claim.status] !== true
        ) {
            errors.push({
                type: "invalid_extra_claim_status",
                index,
                value: claim.status
            });
        }

        if (
            claim.weight !== undefined &&
            claim.weight !== null &&
            !isValidNonNegativeNumber(claim.weight)
        ) {
            errors.push({
                type: "invalid_extra_claim_weight",
                index,
                value: claim.weight
            });
        }
    });

    const duplicateExtraIds = explicitExtraClaimIds.filter(
        (id, index) => explicitExtraClaimIds.indexOf(id) !== index
    );

    if (duplicateExtraIds.length) {
        errors.push({
            type: "duplicate_extra_claim_ids",
            ids: [...new Set(duplicateExtraIds)]
        });
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}


/* ============================================================
   5. GROUND TRUTH INDEXING
   ============================================================ */

function indexGroundTruth(groundTruth) {
    const points = new Map();

    for (const point of groundTruth.points || []) {
        points.set(point.point_id, point);
    }

    return points;
}


/* ============================================================
   6. EVALUATION NORMALIZATION
   ============================================================ */

function normalizeEvaluations(evaluation, groundTruth, run) {
    const pointIndex = indexGroundTruth(groundTruth);

    const hasExplicitContext = Array.isArray(
        run.context_document_ids
    );

    const runContextDocs = new Set(
        hasExplicitContext
            ? run.context_document_ids
            : []
    );

    return evaluation.evaluations.map(item => {
        const point = pointIndex.get(item.point_id);
        const sourceDoc = point?.source_document_id;

        const isAvailable = hasExplicitContext
            ? runContextDocs.has(sourceDoc)
            : point?.context !== "out_context";

        const coverageStatus =
            item.coverage ?? "unrated";

        const status =
            item.status ?? "unrated";

        const metricEligible =
            isAvailable &&
            (
                coverageStatus === "addressed" ||
                coverageStatus === "should"
            );

        return {
            point_id: item.point_id,
            coverage: coverageStatus,
            status,
            excerpt: item.excerpt ?? "",
            note: item.note ?? "",
            importance: point?.importance ?? "undefined",
            relevance: point?.relevance ?? null,
            expected_treatment:
                point?.expected_treatment ?? null,
            source_document_id: sourceDoc ?? null,
            weight: getImportanceWeight(point),
            available_to_model: isAvailable,
            metric_eligible: metricEligible
        };
    });
}

function normalizeExtraClaims(evaluation) {
    if (!Array.isArray(evaluation.extra_claims)) {
        return [];
    }

    const usedIds = new Set();

    return evaluation.extra_claims.map((item, index) => {
        let claimId =
            item.claim_id ??
            `extra_claim_${index + 1}`;

        if (usedIds.has(claimId)) {
            let suffix = 2;
            let candidate = `${claimId}_${suffix}`;

            while (usedIds.has(candidate)) {
                suffix++;
                candidate = `${claimId}_${suffix}`;
            }

            claimId = candidate;
        }

        usedIds.add(claimId);

        const status =
            CB_CONFIG.extraClaimStatus[item.status] === true
                ? item.status
                : "hallu";

        const weight =
            isValidNonNegativeNumber(item.weight)
                ? Number(item.weight)
                : CB_CONFIG.defaultImportanceWeight.High;

        return {
            claim_id: claimId,
            status,
            excerpt: item.excerpt ?? "",
            note: item.note ?? "",
            weight,
            is_extra_claim: true
        };
    });
}


/* ============================================================
   7. PRIMITIVE CLASSIFICATION
   ============================================================ */

function classifyEvaluation(item) {
    return {
        isAddressed: item.coverage === "addressed",
        isShould: item.coverage === "should",
        isGap: item.coverage === "gap",
        isOutContext:
            item.coverage === "out_context",
        isNotRelevant:
            item.coverage === "not_relevant",

        isCorrect: item.status === "correct",
        isPartial: item.status === "partial",
        isInference: item.status === "inference",
        isOver: item.status === "over",
        isError: item.status === "error",
        isMathError:
            item.status === "math_error",
        isHallucination:
            item.status === "hallu",
        isOmission:
            item.status === "omission",
        isMissing:
            item.status === "missing"
    };
}


/* ============================================================
   8-9. STATUS & COVERAGE COUNTS
   ============================================================ */

function countStatuses(items) {
    const counts = {
        correct: 0,
        partial: 0,
        inference: 0,
        over: 0,
        error: 0,
        math_error: 0,
        hallu: 0,
        omission: 0,
        missing: 0,
        na: 0,
        unrated: 0
    };

    for (const item of items) {
        if (counts[item.status] !== undefined) {
            counts[item.status]++;
        }
    }

    return counts;
}

function countCoverage(items) {
    const counts = {
        addressed: 0,
        should: 0,
        gap: 0,
        out_context: 0,
        not_relevant: 0,
        unrated: 0
    };

    for (const item of items) {
        if (counts[item.coverage] !== undefined) {
            counts[item.coverage]++;
        }
    }

    return counts;
}


/* ============================================================
   10-21. CORE METRICS
   ============================================================ */

function calculateRawCoverage(items) {
    const relevant = items.filter(
        item => item.metric_eligible
    );

    if (!relevant.length) {
        return null;
    }

    const addressed = relevant.filter(
        item => item.coverage === "addressed"
    ).length;

    return safeDivide(
        addressed,
        relevant.length
    );
}

function calculateWeightedCoverage(items) {
    let numerator = 0;
    let denominator = 0;

    for (const item of items) {
        if (!item.metric_eligible) {
            continue;
        }

        denominator += item.weight;

        if (item.coverage === "addressed") {
            numerator += item.weight;
        }
    }

    return safeDivide(
        numerator,
        denominator
    );
}

function calculateQuality(items) {
    let numerator = 0;
    let denominator = 0;

    for (const item of items) {
        if (!item.metric_eligible) {
            continue;
        }

        const score =
            CB_CONFIG.statusScore[item.status];

        if (typeof score !== "number") {
            continue;
        }

        numerator +=
            score * item.weight;

        denominator +=
            item.weight;
    }

    return safeDivide(
        numerator,
        denominator
    );
}

function calculateAddressedQuality(items) {
    return calculateQuality(
        items.filter(
            item => item.coverage === "addressed"
        )
    );
}

function calculateDefectRate(
    items,
    status,
    coverageType
) {
    const validItems = items.filter(
        item => item.metric_eligible
    );

    if (!validItems.length) {
        return null;
    }

    let numerator = 0;
    let denominator = 0;

    for (const item of validItems) {
        denominator += item.weight;

        if (
            item.status === status &&
            item.coverage === coverageType
        ) {
            numerator += item.weight;
        }
    }

    return safeDivide(
        numerator,
        denominator
    );
}

function calculateHallucinationRate(items) {
    return calculateDefectRate(
        items,
        "hallu",
        "addressed"
    );
}

function calculateErrorRate(items) {
    return calculateDefectRate(
        items,
        "error",
        "addressed"
    );
}

function calculateMathErrorRate(items) {
    return calculateDefectRate(
        items,
        "math_error",
        "addressed"
    );
}

function calculateOverRate(items) {
    return calculateDefectRate(
        items,
        "over",
        "addressed"
    );
}

function calculateInferenceRate(items) {
    return calculateDefectRate(
        items,
        "inference",
        "addressed"
    );
}

function calculateOmissionRate(items) {
    return calculateDefectRate(
        items,
        "omission",
        "should"
    );
}

function calculateUsableInformation(items) {
    const relevant = items.filter(
        item =>
            item.metric_eligible &&
            item.coverage === "addressed"
    );

    if (!relevant.length) {
        return null;
    }

    let numerator = 0;
    let denominator = 0;

    for (const item of relevant) {
        denominator += item.weight;

        if (
            item.status === "correct" ||
            item.status === "partial"
        ) {
            numerator += item.weight;
        }
    }

    return safeDivide(
        numerator,
        denominator
    );
}

function calculateEffectiveInformation(items) {
    const relevant = items.filter(
        item => item.metric_eligible
    );

    if (!relevant.length) {
        return null;
    }

    let numerator = 0;
    let denominator = 0;

    for (const item of relevant) {
        denominator += item.weight;

        if (item.coverage === "addressed") {
            const quality =
                CB_CONFIG.statusScore[item.status];

            if (typeof quality === "number") {
                numerator +=
                    item.weight * quality;
            }
        }
    }

    return safeDivide(
        numerator,
        denominator
    );
}


/* ============================================================
   22-23. RELATIONSHIP ANALYSIS
   ============================================================ */

function analyzeRelations(
    groundTruth,
    evaluations
) {
    const evalMap = new Map(
        evaluations.map(
            item => [item.point_id, item]
        )
    );

    const relations =
        groundTruth.relations || [];

    const result = [];

    for (const relation of relations) {
        const source = evalMap.get(
            relation.source_point_id
        );

        const target = evalMap.get(
            relation.target_point_id
        );

        if (!source || !target) {
            continue;
        }

        result.push({
            source_point_id:
                relation.source_point_id,

            target_point_id:
                relation.target_point_id,

            type:
                relation.type,

            source_status:
                source.status,

            target_status:
                target.status,

            source_coverage:
                source.coverage,

            target_coverage:
                target.coverage,

            source_available_to_model:
                source.available_to_model,

            target_available_to_model:
                target.available_to_model,

            source_metric_eligible:
                source.metric_eligible,

            target_metric_eligible:
                target.metric_eligible
        });
    }

    return result;
}

function classifyRelationStatus(status) {
    if (
        status === "correct" ||
        status === "partial"
    ) {
        return "valid";
    }

    if (
        [
            "error",
            "hallu",
            "omission",
            "missing",
            "math_error"
        ].includes(status)
    ) {
        return "invalid";
    }

    return "unevaluable";
}

function calculateRelationConsistencyDetails(
    relationResults
) {
    let consistent = 0;
    let evaluated = 0;
    let excluded = 0;

    for (const relation of relationResults) {
        if (
            !relation.source_metric_eligible ||
            !relation.target_metric_eligible
        ) {
            excluded++;
            continue;
        }

        const sourceClass =
            classifyRelationStatus(
                relation.source_status
            );

        const targetClass =
            classifyRelationStatus(
                relation.target_status
            );

        if (
            sourceClass === "unevaluable" ||
            targetClass === "unevaluable"
        ) {
            excluded++;
            continue;
        }

        evaluated++;

        const sourceValid =
            sourceClass === "valid";

        const sourceInvalid =
            sourceClass === "invalid";

        const targetValid =
            targetClass === "valid";

        const targetInvalid =
            targetClass === "invalid";

        let isValid = true;

        switch (relation.type) {
            case "supports":
                if (
                    sourceInvalid ||
                    (
                        sourceValid &&
                        targetInvalid
                    )
                ) {
                    isValid = false;
                }
                break;

            case "depends_on":
                if (
                    sourceInvalid &&
                    targetValid
                ) {
                    isValid = false;
                }
                break;

            case "contradicts":
                if (
                    sourceValid &&
                    targetValid
                ) {
                    isValid = false;
                }
                break;

            default:
                /*
                 * Unknown relation types should already have
                 * been rejected during validation.
                 */
                evaluated--;
                excluded++;
                continue;
        }

        if (isValid) {
            consistent++;
        }
    }

    return {
        score:
            evaluated > 0
                ? safeDivide(
                    consistent,
                    evaluated
                )
                : null,

        consistent_count:
            consistent,

        evaluated_count:
            evaluated,

        excluded_count:
            excluded
    };
}


/* ============================================================
   24-25. INPUT EXPOSURE & PROFILING
   ============================================================ */

function calculateInputExposure(
    inputAssessment
) {
    if (
        !inputAssessment ||
        inputAssessment.overall_exposure ===
            "unknown"
    ) {
        return null;
    }

    const levels = {
        none: 0,
        low: 0.25,
        medium: 0.50,
        high: 0.75,
        critical: 1
    };

    return (
        levels[
            inputAssessment.overall_exposure
        ] ?? null
    );
}

function calculateInputProfile(
    inputAssessment
) {
    if (!inputAssessment) {
        return null;
    }

    return {
        personal_data:
            inputAssessment.personal_data ??
            null,

        special_category_data:
            inputAssessment
                .special_category_data ??
            null,

        confidential_data:
            inputAssessment
                .confidential_data ??
            null,

        unnecessary_or_excessive_data:
            inputAssessment
                .unnecessary_or_excessive_data ??
            null,

        documents_supplied:
            inputAssessment
                .documents_supplied ??
            null,

        documents_with_personal_data:
            inputAssessment
                .documents_with_personal_data ??
            null,

        documents_with_special_category_data:
            inputAssessment
                .documents_with_special_category_data ??
            null,

        documents_with_confidential_data:
            inputAssessment
                .documents_with_confidential_data ??
            null,

        unnecessary_or_excessive_items:
            inputAssessment
                .unnecessary_or_excessive_items ??
            null,

        overall_exposure:
            inputAssessment
                .overall_exposure ??
            null
    };
}


/* ============================================================
   26. SINGLE-RUN METRICS
   ============================================================ */

function calculateRunMetrics({
    run,
    groundTruth,
    evaluation
}) {
    const runValidation =
        validateRunDefinition(run);

    const evaluationValidation =
        validateEvaluation(
            evaluation,
            groundTruth
        );

    const validation = {
        valid:
            runValidation.valid &&
            evaluationValidation.valid,

        errors: [
            ...runValidation.errors,
            ...evaluationValidation.errors
        ],

        warnings: [
            ...runValidation.warnings,
            ...evaluationValidation.warnings
        ]
    };

    if (!validation.valid) {
        return {
            run_id:
                run?.run_id ?? null,

            valid: false,
            validation
        };
    }

    const normalized =
        normalizeEvaluations(
            evaluation,
            groundTruth,
            run
        );

    const extraClaims =
        normalizeExtraClaims(
            evaluation
        );

    const statuses =
        countStatuses(normalized);

    const coverage =
        countCoverage(normalized);

    const relations =
        analyzeRelations(
            groundTruth,
            normalized
        );

    const relationStats =
        calculateRelationConsistencyDetails(
            relations
        );

    const extraHallucinations =
        extraClaims.filter(
            claim =>
                claim.status === "hallu"
        );

    const extraOverClaims =
        extraClaims.filter(
            claim =>
                claim.status === "over"
        );

    const extraErrors =
        extraClaims.filter(
            claim =>
                claim.status === "error"
        );

    const extraHallucinationWeight =
        sum(
            extraHallucinations.map(
                claim => claim.weight
            )
        );

    const totalExtraClaimWeight =
        sum(
            extraClaims.map(
                claim => claim.weight
            )
        );

    const contextDocuments =
        Array.isArray(
            run.context_document_ids
        )
            ? [...run.context_document_ids]
            : [];

    const contextIdentityKnown =
        run.context_id !== undefined &&
        run.context_id !== null
            ? true
            : Array.isArray(
                run.context_document_ids
            );

    const contextId =
        run.context_id ??
        (
            contextIdentityKnown
                ? deriveStableId(
                    "context",
                    canonicalArray(
                        contextDocuments
                    )
                )
                : null
        );

    const contextFingerprint =
        contextIdentityKnown
            ? deriveStableId(
                "context_fp",
                {
                    context_id:
                        contextId,

                    documents:
                        canonicalArray(
                            contextDocuments
                        )
                }
            )
            : null;

    const metrics = {
        run_id:
            run.run_id,

        model_id:
            run.model_id ?? null,

        model_name:
            run.model_name ?? null,

        prompt_id:
            run.prompt_id ?? null,

        input_id:
            run.input_id ?? null,

        context_id:
            contextId,

        context_fingerprint:
            contextFingerprint,

        context_document_ids:
            contextDocuments,

        test_id:
            run.test_id ?? null,

        timestamp:
            run.timestamp ?? null,

        point_count:
            normalized.length,

        metric_eligible_point_count:
            normalized.filter(
                item =>
                    item.metric_eligible
            ).length,

        extra_claims_count:
            extraClaims.length,

        extra_hallucination_count:
            extraHallucinations.length,

        extra_over_count:
            extraOverClaims.length,

        extra_error_count:
            extraErrors.length,

        coverage_raw:
            calculateRawCoverage(
                normalized
            ),

        coverage_weighted:
            calculateWeightedCoverage(
                normalized
            ),

        quality:
            calculateQuality(
                normalized
            ),

        addressed_quality:
            calculateAddressedQuality(
                normalized
            ),

        usable_information:
            calculateUsableInformation(
                normalized
            ),

        effective_information:
            calculateEffectiveInformation(
                normalized
            ),

        omission_rate:
            calculateOmissionRate(
                normalized
            ),

        error_rate:
            calculateErrorRate(
                normalized
            ),

        math_error_rate:
            calculateMathErrorRate(
                normalized
            ),

        gt_hallucination_rate:
            calculateHallucinationRate(
                normalized
            ),

        over_rate:
            calculateOverRate(
                normalized
            ),

        inference_rate:
            calculateInferenceRate(
                normalized
            ),

        absolute_extra_hallucination_penalty:
            extraHallucinationWeight,

        absolute_extra_claim_penalty:
            totalExtraClaimWeight,

        status_counts:
            statuses,

        coverage_counts:
            coverage,

        relation_count:
            relations.length,

        relation_consistency:
            relationStats.score,

        relation_consistent_count:
            relationStats.consistent_count,

        relation_evaluated_count:
            relationStats.evaluated_count,

        relation_excluded_count:
            relationStats.excluded_count,

        input_exposure:
            calculateInputExposure(
                evaluation
                    .input_data_assessment
            ),

        input_profile:
            calculateInputProfile(
                evaluation
                    .input_data_assessment
            )
    };

    return {
        run_id:
            run.run_id,

        valid:
            true,

        validation,

        metrics,

        normalized,

        extra_claims:
            extraClaims,

        relations,

        behavioral_test:
            run.behavioral_test ??
            null
    };
}


/* ============================================================
   27. DELTA COMPARISON
   ============================================================ */

function compareMetricValues(a, b) {
    if (
        !Number.isFinite(a) ||
        !Number.isFinite(b)
    ) {
        return null;
    }

    return b - a;
}

const COMPARABLE_NUMERIC_METRICS = [
    "coverage_raw",
    "coverage_weighted",
    "quality",
    "addressed_quality",
    "usable_information",
    "effective_information",
    "omission_rate",
    "error_rate",
    "math_error_rate",
    "gt_hallucination_rate",
    "over_rate",
    "inference_rate",
    "relation_consistency",
    "input_exposure",
    "extra_claims_count",
    "extra_hallucination_count",
    "extra_over_count",
    "extra_error_count",
    "absolute_extra_hallucination_penalty",
    "absolute_extra_claim_penalty"
];

function compareRuns(runA, runB) {
    const metricsA = runA.metrics;
    const metricsB = runB.metrics;

    const delta = {};

    for (
        const metric of
        COMPARABLE_NUMERIC_METRICS
    ) {
        delta[metric] =
            compareMetricValues(
                metricsA[metric],
                metricsB[metric]
            );
    }

    return {
        comparison_id:
            `${runA.run_id}__vs__${runB.run_id}`,

        run_a:
            runA.run_id,

        run_b:
            runB.run_id,

        model_a:
            metricsA.model_id,

        model_b:
            metricsB.model_id,

        prompt_a:
            metricsA.prompt_id,

        prompt_b:
            metricsB.prompt_id,

        input_a:
            metricsA.input_id,

        input_b:
            metricsB.input_id,

        context_a:
            metricsA.context_id,

        context_b:
            metricsB.context_id,

        delta
    };
}


/* ============================================================
   28. METHODOLOGICAL VARIABLE ANALYSIS
   ============================================================ */

function detectChangedVariables(
    runA,
    runB
) {
    const changed = [];
    const unknown = [];

    const metricsA = runA.metrics;
    const metricsB = runB.metrics;

    function compareIdentity(
        label,
        valueA,
        valueB
    ) {
        if (
            valueA === null ||
            valueA === undefined ||
            valueB === null ||
            valueB === undefined
        ) {
            unknown.push(label);
            return;
        }

        if (valueA !== valueB) {
            changed.push(label);
        }
    }

    compareIdentity(
        "model",
        metricsA.model_id,
        metricsB.model_id
    );

    compareIdentity(
        "prompt",
        metricsA.prompt_id,
        metricsB.prompt_id
    );

    /*
     * Input profile differences can prove that the input
     * changed, but equal profiles cannot prove that two inputs
     * were identical.
     */
    if (
        metricsA.input_id !== null &&
        metricsA.input_id !== undefined &&
        metricsB.input_id !== null &&
        metricsB.input_id !== undefined
    ) {
        if (
            metricsA.input_id !==
            metricsB.input_id
        ) {
            changed.push("input");
        }
    } else {
        const profileA =
            stableSerialize(
                metricsA.input_profile
            );

        const profileB =
            stableSerialize(
                metricsB.input_profile
            );

        if (profileA !== profileB) {
            changed.push("input");
        } else {
            unknown.push("input");
        }
    }

    compareIdentity(
        "context",
        metricsA.context_fingerprint,
        metricsB.context_fingerprint
    );

    return {
        changed_variables:
            [...new Set(changed)],

        unknown_variables:
            [...new Set(unknown)]
    };
}

function analyzeComparisonMethodology(
    runA,
    runB
) {
    const detection =
        detectChangedVariables(
            runA,
            runB
        );

    const changedVariables =
        detection.changed_variables;

    const unknownVariables =
        detection.unknown_variables;

    let type =
        "multidimensional";

    if (unknownVariables.length > 0) {
        type = "indeterminate";
    } else if (
        changedVariables.length === 0
    ) {
        type = "replication";
    } else if (
        changedVariables.length === 1
    ) {
        type =
            "single_variable_change";
    }

    return {
        changed_variables:
            changedVariables,

        unknown_variables:
            unknownVariables,

        comparison_type:
            type,

        is_valid_controlled:
            (
                type === "replication" ||
                type ===
                    "single_variable_change"
            )
    };
}

function controlledComparison(
    runA,
    runB
) {
    return {
        ...compareRuns(
            runA,
            runB
        ),

        methodology:
            analyzeComparisonMethodology(
                runA,
                runB
            )
    };
}


/* ============================================================
   29. MULTIPLE COMPARISONS & POINT DELTAS
   ============================================================ */

function comparePoints(runA, runB) {
    const mapA = new Map(
        runA.normalized.map(
            item => [
                item.point_id,
                item
            ]
        )
    );

    const mapB = new Map(
        runB.normalized.map(
            item => [
                item.point_id,
                item
            ]
        )
    );

    const pointIds = new Set([
        ...mapA.keys(),
        ...mapB.keys()
    ]);

    const result = [];

    for (const pointId of pointIds) {
        const a = mapA.get(pointId);
        const b = mapB.get(pointId);

        result.push({
            point_id:
                pointId,

            run_a:
                a
                    ? {
                        coverage:
                            a.coverage,

                        status:
                            a.status,

                        available_to_model:
                            a.available_to_model,

                        metric_eligible:
                            a.metric_eligible
                    }
                    : null,

            run_b:
                b
                    ? {
                        coverage:
                            b.coverage,

                        status:
                            b.status,

                        available_to_model:
                            b.available_to_model,

                        metric_eligible:
                            b.metric_eligible
                    }
                    : null
        });
    }

    return result;
}

function calculateStatusTransitions(
    runA,
    runB
) {
    const points =
        comparePoints(
            runA,
            runB
        );

    const transitions = {};

    for (const point of points) {
        const a =
            point.run_a?.status;

        const b =
            point.run_b?.status;

        if (!a || !b || a === b) {
            continue;
        }

        const key =
            `${a}__to__${b}`;

        transitions[key] =
            (transitions[key] || 0) + 1;
    }

    return transitions;
}

function calculateBehaviorTransitions(
    runA,
    runB
) {
    const a =
        runA.profile?.behavior;

    const b =
        runB.profile?.behavior;

    if (!a || !b) {
        return {};
    }

    const dimensions =
        new Set([
            ...Object.keys(
                a.observations || {}
            ),
            ...Object.keys(
                b.observations || {}
            )
        ]);

    const transitions = {};

    for (
        const dimension of
        [...dimensions].sort()
    ) {
        const from =
            a.observations?.[
                dimension
            ];

        const to =
            b.observations?.[
                dimension
            ];

        if (
            from === undefined ||
            to === undefined ||
            from === to
        ) {
            continue;
        }

        const key =
            `${dimension}:${String(from)}__to__${String(to)}`;

        transitions[key] =
            (transitions[key] || 0) + 1;
    }

    return transitions;
}

function compareMultipleRuns(
    runResults,
    options = {}
) {
    const {
        maxComparisons = 1000,
        maxScannedPairs = 10000,
        includeMultidimensional = false,
        includeIndeterminate = false
    } = options || {};

    const comparisons = [];

    let scannedPairs = 0;
    let truncated = false;
    let truncationReason = null;

    outer:
    for (
        let i = 0;
        i < runResults.length;
        i++
    ) {
        for (
            let j = i + 1;
            j < runResults.length;
            j++
        ) {
            if (
                scannedPairs >=
                maxScannedPairs
            ) {
                truncated = true;
                truncationReason =
                    "max_scanned_pairs";
                break outer;
            }

            scannedPairs++;

            const baseComparison =
                controlledComparison(
                    runResults[i],
                    runResults[j]
                );

            const type =
                baseComparison
                    .methodology
                    .comparison_type;

            const shouldInclude =
                baseComparison
                    .methodology
                    .is_valid_controlled ||
                (
                    type ===
                        "multidimensional" &&
                    includeMultidimensional
                ) ||
                (
                    type ===
                        "indeterminate" &&
                    includeIndeterminate
                );

            if (!shouldInclude) {
                continue;
            }

            if (
                comparisons.length >=
                maxComparisons
            ) {
                truncated = true;
                truncationReason =
                    "max_comparisons";
                break outer;
            }

            comparisons.push({
                ...baseComparison,

                point_deltas:
                    comparePoints(
                        runResults[i],
                        runResults[j]
                    ),

                status_transitions:
                    calculateStatusTransitions(
                        runResults[i],
                        runResults[j]
                    ),

                behavior_transitions:
                    calculateBehaviorTransitions(
                        runResults[i],
                        runResults[j]
                    )
            });
        }
    }

    return {
        comparisons,

        audit: {
            scanned_pairs:
                scannedPairs,

            generated_comparisons:
                comparisons.length,

            max_comparisons:
                maxComparisons,

            max_scanned_pairs:
                maxScannedPairs,

            truncated,

            truncation_reason:
                truncationReason
        }
    };
}


/* ============================================================
   30-33. GROUPING & AGGREGATED STATISTICS
   ============================================================ */

function groupByModel(runResults) {
    const groups = {};

    for (const run of runResults) {
        const key =
            run.metrics.model_id ??
            "unknown_model";

        if (!groups[key]) {
            groups[key] = [];
        }

        groups[key].push(run);
    }

    return groups;
}

function groupByPrompt(runResults) {
    const groups = {};

    for (const run of runResults) {
        const key =
            run.metrics.prompt_id ??
            "unknown_prompt";

        if (!groups[key]) {
            groups[key] = [];
        }

        groups[key].push(run);
    }

    return groups;
}

function groupByContext(runResults) {
    const groups = {};

    for (const run of runResults) {
        const key =
            run.metrics.context_id ??
            "unknown_context";

        if (!groups[key]) {
            groups[key] = [];
        }

        groups[key].push(run);
    }

    return groups;
}

function groupByExactConfiguration(
    runResults
) {
    const groups = {};
    const unresolved = [];

    for (const run of runResults) {
        const model =
            run.metrics.model_id;

        const prompt =
            run.metrics.prompt_id;

        const input =
            run.metrics.input_id;

        const context =
            run.metrics.context_fingerprint;

        if (
            model === null ||
            model === undefined ||
            prompt === null ||
            prompt === undefined ||
            input === null ||
            input === undefined ||
            context === null ||
            context === undefined
        ) {
            unresolved.push(
                run.run_id
            );

            continue;
        }

        const key =
            deriveStableId(
                "config",
                {
                    model,
                    prompt,
                    input,
                    context
                }
            );

        if (!groups[key]) {
            groups[key] = [];
        }

        groups[key].push(run);
    }

    return {
        groups,
        unresolved
    };
}

const AGGREGATE_METRIC_DEFINITIONS = {
    coverage_raw: {
        minBound: 0,
        maxBound: 1
    },

    coverage_weighted: {
        minBound: 0,
        maxBound: 1
    },

    quality: {
        minBound: 0,
        maxBound: 1
    },

    addressed_quality: {
        minBound: 0,
        maxBound: 1
    },

    usable_information: {
        minBound: 0,
        maxBound: 1
    },

    effective_information: {
        minBound: 0,
        maxBound: 1
    },

    omission_rate: {
        minBound: 0,
        maxBound: 1
    },

    error_rate: {
        minBound: 0,
        maxBound: 1
    },

    math_error_rate: {
        minBound: 0,
        maxBound: 1
    },

    gt_hallucination_rate: {
        minBound: 0,
        maxBound: 1
    },

    over_rate: {
        minBound: 0,
        maxBound: 1
    },

    inference_rate: {
        minBound: 0,
        maxBound: 1
    },

    relation_consistency: {
        minBound: 0,
        maxBound: 1
    },

    input_exposure: {
        minBound: 0,
        maxBound: 1
    },

    extra_claims_count: {
        minBound: 0
    },

    extra_hallucination_count: {
        minBound: 0
    },

    extra_over_count: {
        minBound: 0
    },

    extra_error_count: {
        minBound: 0
    },

    absolute_extra_hallucination_penalty: {
        minBound: 0
    },

    absolute_extra_claim_penalty: {
        minBound: 0
    }
};

function aggregateRuns(runs) {
    if (!runs.length) {
        return null;
    }

    const result = {};

    for (
        const [
            metric,
            bounds
        ] of Object.entries(
            AGGREGATE_METRIC_DEFINITIONS
        )
    ) {
        result[metric] =
            calculateStats(
                runs.map(
                    run =>
                        run.metrics[
                            metric
                        ]
                ),
                bounds
            );
    }

    return {
        run_count:
            runs.length,

        metrics:
            result
    };
}


/* ============================================================
   34. RUN & BEHAVIOR PROFILES
   ============================================================ */

function buildBehaviorProfile(
    runResult
) {
    const behavioral =
        runResult.behavioral_test;

    if (
        !behavioral ||
        !behavioral.enabled
    ) {
        return null;
    }

    return {
        dimensions:
            behavioral.dimensions ||
            [],

        variables:
            behavioral
                .controlled_variables ||
            {},

        observations:
            behavioral.observations ||
            {},

        transitions:
            behavioral.transitions ||
            {}
    };
}

function buildRunProfile(runResult) {
    const metrics =
        runResult.metrics;

    return {
        run_id:
            metrics.run_id,

        identity: {
            model:
                metrics.model_id,

            prompt:
                metrics.prompt_id,

            input:
                metrics.input_id,

            context:
                metrics.context_id,

            context_fingerprint:
                metrics.context_fingerprint,

            context_docs:
                metrics.context_document_ids,

            test:
                metrics.test_id
        },

        coverage: {
            raw:
                metrics.coverage_raw,

            weighted:
                metrics.coverage_weighted,

            distribution:
                metrics.coverage_counts
        },

        quality: {
            global:
                metrics.quality,

            addressed:
                metrics.addressed_quality
        },

        information: {
            usable:
                metrics.usable_information,

            effective:
                metrics.effective_information
        },

        failures: {
            omission:
                metrics.omission_rate,

            error:
                metrics.error_rate,

            math_error:
                metrics.math_error_rate,

            gt_hallucination:
                metrics.gt_hallucination_rate,

            extra_hallucination_penalty:
                metrics
                    .absolute_extra_hallucination_penalty,

            extra_claim_penalty:
                metrics
                    .absolute_extra_claim_penalty,

            over:
                metrics.over_rate,

            inference:
                metrics.inference_rate
        },

        relations: {
            count:
                metrics.relation_count,

            evaluated:
                metrics.relation_evaluated_count,

            excluded:
                metrics.relation_excluded_count,

            consistency:
                metrics.relation_consistency
        },

        input: {
            exposure:
                metrics.input_exposure,

            profile:
                metrics.input_profile
        },

        behavior:
            buildBehaviorProfile(
                runResult
            )
    };
}


/* ============================================================
   35. CORE ENGINE
   ============================================================ */

function evaluateRun({
    run,
    groundTruth,
    evaluation
}) {
    const result =
        calculateRunMetrics({
            run,
            groundTruth,
            evaluation
        });

    if (!result.valid) {
        return result;
    }

    return {
        ...result,

        profile:
            buildRunProfile(
                result
            )
    };
}

function evaluateExperiment({
    experiment,
    groundTruth,
    evaluations,
    options = {}
}) {
    if (
        !experiment ||
        !Array.isArray(
            experiment.runs
        )
    ) {
        throw new TypeError(
            "experiment.runs must be an array"
        );
    }

    if (
        !evaluations ||
        typeof evaluations !==
            "object"
    ) {
        throw new TypeError(
            "evaluations must be an object keyed by run_id"
        );
    }

    const runIds =
        experiment.runs.map(
            run => run?.run_id
        );

    const duplicateRunIds =
        runIds.filter(
            (id, index) =>
                runIds.indexOf(id) !==
                index
        );

    if (duplicateRunIds.length) {
        throw new Error(
            `Duplicate run_id values: ${[
                ...new Set(
                    duplicateRunIds
                )
            ].join(", ")}`
        );
    }

    const validRuns = [];
    const invalidRuns = [];
    const missingEvaluations = [];

    for (
        const run of
        experiment.runs
    ) {
        const evaluation =
            evaluations[
                run?.run_id
            ];

        if (!evaluation) {
            missingEvaluations.push(
                run?.run_id ?? null
            );
            continue;
        }

        const result =
            evaluateRun({
                run,
                groundTruth,
                evaluation
            });

        if (result.valid) {
            validRuns.push(result);
        } else {
            invalidRuns.push(result);
        }
    }

    const comparisonResult =
        compareMultipleRuns(
            validRuns,
            options.comparisons || {}
        );

    const exactConfigurations =
        groupByExactConfiguration(
            validRuns
        );

    return {
        experiment_id:
            experiment.experiment_id ??
            null,

        requested_runs_count:
            experiment.runs.length,

        valid_runs_count:
            validRuns.length,

        invalid_runs_count:
            invalidRuns.length,

        missing_evaluations_count:
            missingEvaluations.length,

        runs:
            validRuns,

        invalid_runs:
            invalidRuns,

        missing_evaluations:
            missingEvaluations,

        comparisons:
            comparisonResult.comparisons,

        comparisons_audit:
            comparisonResult.audit,

        model_groups:
            Object.fromEntries(
                Object.entries(
                    groupByModel(
                        validRuns
                    )
                ).map(
                    ([key, values]) => [
                        key,
                        aggregateRuns(
                            values
                        )
                    ]
                )
            ),

        prompt_groups:
            Object.fromEntries(
                Object.entries(
                    groupByPrompt(
                        validRuns
                    )
                ).map(
                    ([key, values]) => [
                        key,
                        aggregateRuns(
                            values
                        )
                    ]
                )
            ),

        context_groups:
            Object.fromEntries(
                Object.entries(
                    groupByContext(
                        validRuns
                    )
                ).map(
                    ([key, values]) => [
                        key,
                        aggregateRuns(
                            values
                        )
                    ]
                )
            ),

        repeated_runs_statistics:
            Object.fromEntries(
                Object.entries(
                    exactConfigurations
                        .groups
                ).map(
                    ([key, values]) => [
                        key,
                        aggregateRuns(
                            values
                        )
                    ]
                )
            ),

        unresolved_configuration_runs:
            exactConfigurations
                .unresolved,

        model_prompt_matrix:
            (function buildModelPromptMatrix(
                runResults
            ) {
                const matrix = {};

                for (
                    const run of
                    runResults
                ) {
                    const model =
                        run.metrics
                            .model_id ??
                        "unknown_model";

                    const prompt =
                        run.metrics
                            .prompt_id ??
                        "unknown_prompt";

                    if (!matrix[model]) {
                        matrix[model] = {};
                    }

                    if (
                        !matrix[model][
                            prompt
                        ]
                    ) {
                        matrix[model][
                            prompt
                        ] = [];
                    }

                    matrix[model][
                        prompt
                    ].push(
                        run.run_id
                    );
                }

                return matrix;
            })(validRuns)
    };
}


/* ============================================================
   36. FINAL REPORT EXPORT
   ============================================================ */

function buildExperimentReport({
    experiment,
    groundTruth,
    evaluations,
    options = {}
}) {
    const evaluated =
        evaluateExperiment({
            experiment,
            groundTruth,
            evaluations,
            options
        });

    return {
        schema:
            "diber-evaluation-v0.9.0",

        engine_version:
            CB_CONFIG.version,

        deterministic:
            true,

        ai_judge:
            false,

        experiment_id:
            evaluated.experiment_id,

        audit: {
            requested_runs:
                evaluated
                    .requested_runs_count,

            valid_runs:
                evaluated
                    .valid_runs_count,

            invalid_runs:
                evaluated
                    .invalid_runs_count,

            missing_evaluations:
                evaluated
                    .missing_evaluations_count,

            unresolved_configuration_runs:
                evaluated
                    .unresolved_configuration_runs
                    .length,

            comparisons:
                evaluated
                    .comparisons_audit
        },

        run_count:
            evaluated
                .valid_runs_count,

        runs:
            evaluated.runs,

        invalid_runs:
            evaluated.invalid_runs,

        missing_evaluations:
            evaluated
                .missing_evaluations,

        unresolved_configuration_runs:
            evaluated
                .unresolved_configuration_runs,

        comparisons:
            evaluated.comparisons,

        groups: {
            models:
                evaluated
                    .model_groups,

            prompts:
                evaluated
                    .prompt_groups,

            contexts:
                evaluated
                    .context_groups,

            exact_configurations:
                evaluated
                    .repeated_runs_statistics
        },

        matrix:
            evaluated
                .model_prompt_matrix
    };
}


/* ============================================================
   37. SPA ADAPTER
   ============================================================ */

function deriveContextIdFromSPA(
    documents,
    contextDocumentIds
) {
    const docs =
        Array.isArray(documents)
            ? documents
            : [];

    const ids =
        canonicalArray(
            contextDocumentIds
        );

    const identity = ids.map(id => {
        const doc = docs.find(
            candidate =>
                candidate?.id === id
        );

        if (!doc) {
            return {
                id
            };
        }

        const explicitVersion =
            doc.content_hash ??
            doc.contentHash ??
            doc.hash ??
            doc.version ??
            null;

        if (
            explicitVersion !== null &&
            explicitVersion !== undefined
        ) {
            return {
                id,
                version:
                    explicitVersion
            };
        }

        if (
            doc.content !== undefined
        ) {
            return {
                id,
                content_hash:
                    stableHash(
                        doc.content
                    )
            };
        }

        if (
            doc.text !== undefined
        ) {
            return {
                id,
                content_hash:
                    stableHash(
                        doc.text
                    )
            };
        }

        return {
            id
        };
    });

    return deriveStableId(
        "context",
        identity
    );
}

function extractEngineDataFromSPA(
    spaState
) {
    const documents =
        Array.isArray(
            spaState?.documents
        )
            ? spaState.documents
            : [];

    const responses =
        Array.isArray(
            spaState?.responses
        )
            ? spaState.responses
            : [];

    const groundTruth = {
        points: [],

        relations:
            spaState?.meta?.relations ||
            []
    };

    const evaluations = {};

    for (
        const response of
        responses
    ) {
        evaluations[
            response.id
        ] = {
            evaluations: [],

            extra_claims:
                response.extraClaims ||
                response.extra_claims ||
                [],

            input_data_assessment:
                response
                    .inputDataAssessment ??
                response
                    .input_data_assessment ??
                null
        };
    }

    for (
        const doc of documents
    ) {
        for (
            const point of
            doc.points || []
        ) {
            groundTruth.points.push({
                point_id:
                    point.id,

                importance:
                    point.importance ||
                    "undefined",

                weight:
                    point.weight,

                relevance:
                    point.relevance ??
                    null,

                expected_treatment:
                    point.expected_treatment ??
                    point.expectedTreatment ??
                    null,

                context:
                    point.context ??
                    null,

                source_document_id:
                    doc.id
            });

            for (
                const response of
                responses
            ) {
                const evalData =
                    point.evals?.[
                        response.id
                    ] || {};

                evaluations[
                    response.id
                ].evaluations.push({
                    point_id:
                        point.id,

                    coverage:
                        evalData.coverage ??
                        "unrated",

                    status:
                        evalData.status ??
                        "unrated",

                    excerpt:
                        evalData.excerpt ??
                        "",

                    note:
                        evalData.note ??
                        ""
                });
            }
        }
    }

    const runs =
        responses.map(response => {
            const contextDocumentIds =
                Array.isArray(
                    response.contextDocs
                )
                    ? response.contextDocs
                    : Array.isArray(
                        response
                            .context_document_ids
                    )
                        ? response
                            .context_document_ids
                        : documents.map(
                            doc => doc.id
                        );

            const explicitPromptId =
                response.promptId ??
                response.prompt_id ??
                null;

            const promptId =
                explicitPromptId ??
                (
                    response.prompt !==
                        undefined &&
                    response.prompt !==
                        null
                        ? deriveStableId(
                            "prompt",
                            response.prompt
                        )
                        : null
                );

            const explicitInputId =
                response.inputId ??
                response.input_id ??
                null;

            const rawInput =
                response.input ??
                response.inputText ??
                response.input_text ??
                null;

            const inputId =
                explicitInputId ??
                (
                    rawInput !== null &&
                    rawInput !== undefined
                        ? deriveStableId(
                            "input",
                            rawInput
                        )
                        : null
                );

            const explicitContextId =
                response.contextId ??
                response.context_id ??
                null;

            const contextId =
                explicitContextId ??
                deriveContextIdFromSPA(
                    documents,
                    contextDocumentIds
                );

            return {
                run_id:
                    response.id,

                model_id:
                    response
                        .analysisMeta
                        ?.evaluator ??
                    response.model_id ??
                    response.modelId ??
                    null,

                model_name:
                    response.model_name ??
                    response.modelName ??
                    null,

                prompt_id:
                    promptId,

                input_id:
                    inputId,

                context_document_ids:
                    contextDocumentIds,

                context_id:
                    contextId,

                test_id:
                    response.testId ??
                    response.test_id ??
                    response.id,

                timestamp:
                    response.timestamp ??
                    null,

                behavioral_test:
                    response
                        .behavioral_test ??
                    response
                        .behavioralTest ??
                    {
                        enabled: false
                    }
            };
        });

    const experiment = {
        experiment_id:
            spaState?.meta
                ?.experiment_id ??
            spaState?.meta
                ?.experimentId ??
            "CURRENT_DIBER_STATE",

        runs
    };

    return {
        experiment,
        groundTruth,
        evaluations
    };
}


/* ============================================================
   38. PUBLIC API
   ============================================================ */

const DIBERCore = {
    buildExperimentReport,
    evaluateExperiment,
    evaluateRun,
    extractEngineDataFromSPA,

    validateEvaluation,
    validateRunDefinition,

    CB_CONFIG
};


/*
 * Node.js / CommonJS export.
 */
if (
    typeof module !== "undefined" &&
    module.exports
) {
    module.exports = DIBERCore;
}


/*
 * Native browser export.
 */
if (
    typeof window !== "undefined"
) {
    window.DIBERCore =
        DIBERCore;
}
