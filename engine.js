/* ============================================================
   DIBER Core — MOTORE DI VALUTAZIONE (EVALUATION ENGINE)
   Versione: 0.3 (Contesto Reale, Validità Metodologica, Statistiche)
   Linguaggio: JavaScript (Compatibile con Node.js e Browser)
   Tipo: Deterministico / No AI-as-a-judge

   PRINCIPIO ARCHITETTONICO:

   INPUT (Dati JSON)
     ↓
   VALIDAZIONE (Integrità struttura)
     ↓
   NORMALIZZAZIONE (Controllo del contesto reale fornito al modello)
     ↓
   METRICHE PRIMITIVE (Conteggi e pesi base)
     ↓
   METRICHE DERIVATE (Qualità, Copertura, Tassi di Errore)
     ↓
   ANALISI DELLE RELAZIONI (Coerenza logica e semantica)
     ↓
   CONFRONTO RUN (Validazione metodologica delle variabili)
     ↓
   REPORT STRUTTURATO (Con varianza statistica per run multiple)
   ============================================================ */

/* ============================================================
   1. CONFIGURAZIONE DI BASE
   ============================================================ */

const CB_CONFIG = {
    version: "0.3",

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

    defaultImportanceWeight: {
        "Critical": 2.00,
        "High": 1.00,
        "Medium": 0.50,
        "Low": 0.25,
        "undefined": 1.00
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
        missing: 1.00,
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
   2. UTILITY & STATISTICHE AVANZATE
   ============================================================ */

function clamp(value, min = 0, max = 1) {
    return Math.min(max, Math.max(min, value));
}

function safeDivide(a, b) {
    if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) {
        return null;
    }
    return a / b;
}

function percentage(value) {
    if (value === null || value === undefined) {
        return null;
    }
    return Math.round(value * 10000) / 100;
}

function sum(values) {
    return values.reduce((acc, value) => {
        return acc + (Number.isFinite(value) ? value : 0);
    }, 0);
}

function average(values) {
    const valid = values.filter(value => Number.isFinite(value));
    if (!valid.length) return null;
    return sum(valid) / valid.length;
}

function calculateStats(values) {
    const valid = values.filter(value => Number.isFinite(value));
    const n = valid.length;
    
    if (n === 0) {
        return { 
            n: 0, mean: null, min: null, max: null, 
            range: null, stddev: null, ci_lower: null, ci_upper: null 
        };
    }
    
    const mean = sum(valid) / n;
    const min = Math.min(...valid);
    const max = Math.max(...valid);
    const range = max - min;
    
    let variance = 0;
    if (n > 1) {
        variance = valid.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / (n - 1);
    }
    const stddev = Math.sqrt(variance);

    // Intervallo di confidenza al 95%
    let ci_lower = null;
    let ci_upper = null;
    if (n > 1) {
        const standardError = stddev / Math.sqrt(n);
        const marginOfError = 1.96 * standardError;
        ci_lower = Math.max(0, mean - marginOfError);
        ci_upper = Math.min(1, mean + marginOfError);
    }

    return { n, mean, min, max, range, stddev, ci_lower, ci_upper };
}

/* ============================================================
   3. NORMALIZZAZIONE DELL'IMPORTANZA (PESI)
   ============================================================ */

function getImportanceWeight(point) {
    if (point && point.weight !== undefined && point.weight !== null) {
        return parseFloat(point.weight);
    }
    if (!point || !point.importance) {
        return CB_CONFIG.defaultImportanceWeight.undefined;
    }
    return (
        CB_CONFIG.defaultImportanceWeight[point.importance]
        ?? CB_CONFIG.defaultImportanceWeight.undefined
    );
}

/* ============================================================
   4. VALIDAZIONE STRUTTURALE
   ============================================================ */

function validateEvaluation(evaluation, groundTruth) {
    const errors = [];
    const warnings = [];

    if (!evaluation) {
        errors.push("evaluation_missing");
        return { valid: false, errors, warnings };
    }
    if (!groundTruth) {
        errors.push("ground_truth_missing");
        return { valid: false, errors, warnings };
    }
    if (!Array.isArray(evaluation.evaluations)) {
        errors.push("evaluations_not_array");
    }
    if (!Array.isArray(groundTruth.points)) {
        errors.push("ground_truth_points_not_array");
    }

    if (errors.length) return { valid: false, errors, warnings };

    const expectedIds = groundTruth.points.map(point => point.point_id);
    const receivedIds = evaluation.evaluations.map(item => item.point_id);

    // Controllo duplicati
    const duplicates = receivedIds.filter((id, index) => receivedIds.indexOf(id) !== index);
    if (duplicates.length) {
        errors.push({ type: "duplicate_point_ids", ids: [...new Set(duplicates)] });
    }

    // Controllo punti mancanti
    const missing = expectedIds.filter(id => !receivedIds.includes(id));
    if (missing.length) {
        errors.push({ type: "missing_point_ids", ids: missing });
    }

    // Controllo punti sconosciuti
    const unknown = receivedIds.filter(id => !expectedIds.includes(id));
    if (unknown.length) {
        errors.push({ type: "unknown_point_ids", ids: [...new Set(unknown)] });
    }

    return { valid: errors.length === 0, errors, warnings };
}

/* ============================================================
   5. INDICIZZAZIONE GROUND TRUTH
   ============================================================ */

function indexGroundTruth(groundTruth) {
    const points = new Map();
    for (const point of groundTruth.points || []) {
        points.set(point.point_id, point);
    }
    return points;
}

/* ============================================================
   6. NORMALIZZAZIONE DELLE VALUTAZIONI (Controllo Contesto Reale)
   ============================================================ */

function normalizeEvaluations(evaluation, groundTruth, run) {
    const pointIndex = indexGroundTruth(groundTruth);
    
    // Controlla quali documenti sono stati effettivamente passati al LLM in questa run
    const runContextDocs = new Set(run.context_document_ids || []);
    const hasExplicitContext = run.context_document_ids && Array.isArray(run.context_document_ids);

    return evaluation.evaluations.map(item => {
        const point = pointIndex.get(item.point_id);
        const sourceDoc = point?.source_document_id;

        // Se è definito un contesto esplicito, verifica la presenza del documento, altrimenti affidati al tag manuale
        const isAvailable = hasExplicitContext
            ? runContextDocs.has(sourceDoc)
            : point?.context !== "out_context";

        return {
            point_id: item.point_id,
            coverage: item.coverage ?? "unrated",
            status: item.status ?? "unrated",
            excerpt: item.excerpt ?? "",
            note: item.note ?? "",
            importance: point?.importance ?? "undefined",
            relevance: point?.relevance ?? null,
            expected_treatment: point?.expected_treatment ?? null,
            source_document_id: sourceDoc ?? null,
            weight: getImportanceWeight(point),
            available_to_model: isAvailable
        };
    });
}

/* ============================================================
   7. CLASSIFICAZIONE PRIMITIVA
   ============================================================ */

function classifyEvaluation(item) {
    return {
        isAddressed: item.coverage === "addressed",
        isShould: item.coverage === "should",
        isGap: item.coverage === "gap",
        isOutContext: item.coverage === "out_context",
        isNotRelevant: item.coverage === "not_relevant",
        isCorrect: item.status === "correct",
        isPartial: item.status === "partial",
        isInference: item.status === "inference",
        isOver: item.status === "over",
        isError: item.status === "error",
        isHallucination: item.status === "hallu",
        isOmission: item.status === "omission",
        isMissing: item.status === "missing"
    };
}

/* ============================================================
   8-9. CONTEGGI STATUS & COVERAGE
   ============================================================ */

function countStatuses(items) {
    const counts = { correct: 0, partial: 0, inference: 0, over: 0, error: 0, math_error: 0, hallu: 0, omission: 0, missing: 0, na: 0, unrated: 0 };
    for (const item of items) {
        if (counts[item.status] !== undefined) counts[item.status]++;
    }
    return counts;
}

function countCoverage(items) {
    const counts = { addressed: 0, should: 0, gap: 0, out_context: 0, not_relevant: 0, unrated: 0 };
    for (const item of items) {
        if (counts[item.coverage] !== undefined) counts[item.coverage]++;
    }
    return counts;
}

/* ============================================================
   10-21. METRICHE CORE
   ============================================================ */

function calculateRawCoverage(items) {
    const relevant = items.filter(item => item.coverage === "addressed" || item.coverage === "should");
    if (!relevant.length) return null;
    const addressed = relevant.filter(item => item.coverage === "addressed").length;
    return safeDivide(addressed, relevant.length);
}

function calculateWeightedCoverage(items) {
    let numerator = 0, denominator = 0;
    for (const item of items) {
        if (item.coverage !== "addressed" && item.coverage !== "should") continue;
        denominator += item.weight;
        if (item.coverage === "addressed") numerator += item.weight;
    }
    return safeDivide(numerator, denominator);
}

function calculateQuality(items) {
    let numerator = 0, denominator = 0;
    for (const item of items) {
        const score = CB_CONFIG.statusScore[item.status];
        if (score === null || score === undefined) continue;
        numerator += score * item.weight;
        denominator += item.weight;
    }
    return safeDivide(numerator, denominator);
}

function calculateAddressedQuality(items) {
    return calculateQuality(items.filter(item => item.coverage === "addressed"));
}

function calculateDefectRate(items, status, coverageType) {
    // Il denominatore universale è il totale del Ground Truth atteso (materialmente rilevante e in contesto)
    // Questo risolve matematicamente il bug in cui 1 allucinazione su 1 punto affrontato risultava nel 100% di hallu_rate.
    const totalValidItems = items.filter(i => i.coverage === "addressed" || i.coverage === "should");
    if (!totalValidItems.length) return null;
    
    let numerator = 0, denominator = 0;
    for (const item of totalValidItems) {
        denominator += item.weight;
        if (item.status === status && item.coverage === coverageType) {
            numerator += item.weight;
        }
    }
    return safeDivide(numerator, denominator);
}

function calculateHallucinationRate(items) { return calculateDefectRate(items, "hallu", "addressed"); }
function calculateErrorRate(items) { return calculateDefectRate(items, "error", "addressed"); }
function calculateMathErrorRate(items) { return calculateDefectRate(items, "math_error", "addressed"); } 
function calculateOverRate(items) { return calculateDefectRate(items, "over", "addressed"); }
function calculateInferenceRate(items) { return calculateDefectRate(items, "inference", "addressed"); }
function calculateOmissionRate(items) { return calculateDefectRate(items, "omission", "should"); }

function calculateUsableInformation(items) {
    const relevant = items.filter(item => item.coverage === "addressed");
    if (!relevant.length) return null;
    let numerator = 0, denominator = 0;
    for (const item of relevant) {
        denominator += item.weight;
        if (item.status === "correct" || item.status === "partial") numerator += item.weight;
    }
    return safeDivide(numerator, denominator);
}

function calculateEffectiveInformation(items) {
    const relevant = items.filter(item => item.coverage === "addressed" || item.coverage === "should");
    if (!relevant.length) return null;
    let numerator = 0, denominator = 0;
    for (const item of relevant) {
        denominator += item.weight;
        if (item.coverage === "addressed") {
            const quality = CB_CONFIG.statusScore[item.status];
            if (quality !== null) numerator += item.weight * quality;
        }
    }
    return safeDivide(numerator, denominator);
}

/* ============================================================
   22-23. ANALISI DELLE RELAZIONI (Validazione Semantica)
   ============================================================ */

function analyzeRelations(groundTruth, evaluations) {
    const evalMap = new Map(evaluations.map(item => [item.point_id, item]));
    const relations = groundTruth.relations || [];
    const result = [];

    for (const relation of relations) {
        const source = evalMap.get(relation.source_point_id);
        const target = evalMap.get(relation.target_point_id);
        if (!source || !target) continue;

        result.push({
            source_point_id: relation.source_point_id,
            target_point_id: relation.target_point_id,
            type: relation.type,
            source_status: source.status,
            target_status: target.status,
            source_coverage: source.coverage,
            target_coverage: target.coverage
        });
    }
    return result;
}

function calculateRelationConsistency(relationResults) {
    if (!relationResults.length) return null;
    let consistent = 0;

    for (const relation of relationResults) {
        let valid = true;

        if (relation.type === "supports" && relation.source_status === "hallu") {
            valid = false;
        }

        if (relation.type === "depends_on") {
            const invalidSourceStates = ["error", "hallu", "omission", "missing"];
            if (invalidSourceStates.includes(relation.source_status) && relation.target_status === "correct") {
                valid = false; 
            }
        }

        // Se due informazioni sono state riconosciute entrambe come 'correct', ma nella realtà si contraddicono
        if (relation.type === "contradicts" && relation.source_status === "correct" && relation.target_status === "correct") {
            valid = true;
        }

        if (valid) consistent++;
    }

    return safeDivide(consistent, relationResults.length);
}

/* ============================================================
   24-25. ESPOSIZIONE INPUT & PROFILAZIONE
   ============================================================ */

function calculateInputExposure(inputAssessment) {
    if (!inputAssessment || inputAssessment.overall_exposure === "unknown") return null;
    const levels = { none: 0, low: 0.25, medium: 0.50, high: 0.75, critical: 1 };
    return levels[inputAssessment.overall_exposure] ?? null;
}

function calculateInputProfile(inputAssessment) {
    if (!inputAssessment) return null;
    return {
        personal_data: inputAssessment.personal_data ?? null,
        special_category_data: inputAssessment.special_category_data ?? null,
        confidential_data: inputAssessment.confidential_data ?? null,
        unnecessary_or_excessive_data: inputAssessment.unnecessary_or_excessive_data ?? null,
        documents_supplied: inputAssessment.documents_supplied ?? null,
        documents_with_personal_data: inputAssessment.documents_with_personal_data ?? null,
        documents_with_special_category_data: inputAssessment.documents_with_special_category_data ?? null,
        documents_with_confidential_data: inputAssessment.documents_with_confidential_data ?? null,
        unnecessary_or_excessive_items: inputAssessment.unnecessary_or_excessive_items ?? null,
        overall_exposure: inputAssessment.overall_exposure ?? null
    };
}

/* ============================================================
   26. METRICHE DELLA SINGOLA RUN
   ============================================================ */

function calculateRunMetrics({ run, groundTruth, evaluation }) {
    const validation = validateEvaluation(evaluation, groundTruth);
    if (!validation.valid) {
        return { run_id: run.run_id, valid: false, validation };
    }

    const normalized = normalizeEvaluations(evaluation, groundTruth, run);
    const statuses = countStatuses(normalized);
    const coverage = countCoverage(normalized);
    const relations = analyzeRelations(groundTruth, normalized);

    const metrics = {
        run_id: run.run_id,
        model_id: run.model_id ?? null,
        model_name: run.model_name ?? null,
        prompt_id: run.prompt_id ?? null,
        context_id: run.context_id ?? null,
        context_document_ids: run.context_document_ids ?? [],
        test_id: run.test_id ?? null,
        timestamp: run.timestamp ?? null,
        
        point_count: normalized.length,
        
        coverage_raw: calculateRawCoverage(normalized),
        coverage_weighted: calculateWeightedCoverage(normalized),
        
        quality: calculateQuality(normalized),
        addressed_quality: calculateAddressedQuality(normalized),
        
        usable_information: calculateUsableInformation(normalized),
        effective_information: calculateEffectiveInformation(normalized),
        
        omission_rate: calculateOmissionRate(normalized),
        error_rate: calculateErrorRate(normalized),
        math_error_rate: calculateMathErrorRate(normalized),
        hallucination_rate: calculateHallucinationRate(normalized),
        over_rate: calculateOverRate(normalized),
        inference_rate: calculateInferenceRate(normalized),
        
        status_counts: statuses,
        coverage_counts: coverage,
        
        relation_count: relations.length,
        relation_consistency: calculateRelationConsistency(relations),
        
        input_exposure: calculateInputExposure(evaluation.input_data_assessment),
        input_profile: calculateInputProfile(evaluation.input_data_assessment)
    };

    return { 
        run_id: run.run_id, 
        valid: true, 
        metrics, 
        normalized, 
        relations,
        behavioral_test: run.behavioral_test ?? null
    };
}

/* ============================================================
   27. CONFRONTO DELTA (TRA DUE ESECUZIONI)
   ============================================================ */

function compareMetricValues(a, b) {
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return b - a;
}

function compareRuns(runA, runB) {
    const metricsA = runA.metrics;
    const metricsB = runB.metrics;

    const numericMetrics = [
        "coverage_raw", "coverage_weighted", "quality", "addressed_quality",
        "usable_information", "effective_information", "omission_rate",
        "error_rate", "math_error_rate", "hallucination_rate", "over_rate", "inference_rate",
        "relation_consistency", "input_exposure"
    ];

    const delta = {};
    for (const metric of numericMetrics) {
        delta[metric] = compareMetricValues(metricsA[metric], metricsB[metric]);
    }

    return {
        comparison_id: `${runA.run_id}__vs__${runB.run_id}`,
        run_a: runA.run_id,
        run_b: runB.run_id,
        model_a: metricsA.model_id,
        model_b: metricsB.model_id,
        prompt_a: metricsA.prompt_id,
        prompt_b: metricsB.prompt_id,
        context_a: metricsA.context_id,
        context_b: metricsB.context_id,
        delta
    };
}

/* ============================================================
   28. ANALISI VARIABILI METODOLOGICHE & CONFRONTO CONTROLLATO
   ============================================================ */

function detectChangedVariables(runA, runB) {
    const changes = [];

    if (runA.metrics.model_id !== runB.metrics.model_id) changes.push("model");
    if (runA.metrics.prompt_id !== runB.metrics.prompt_id) changes.push("prompt");

    const ctxA = [...(runA.metrics.context_document_ids || [])].sort().join("|");
    const ctxB = [...(runB.metrics.context_document_ids || [])].sort().join("|");
    if (ctxA !== ctxB) changes.push("context");

    if (JSON.stringify(runA.metrics.input_profile) !== JSON.stringify(runB.metrics.input_profile)) {
        changes.push("input");
    }

    return changes;
}

function analyzeComparisonMethodology(runA, runB) {
    const changedVariables = detectChangedVariables(runA, runB);
    let type = "multidimensional"; 
    
    if (changedVariables.length === 0) {
        type = "replication"; 
    } else if (changedVariables.length === 1) {
        type = "strictly_controlled"; 
    }

    return {
        changed_variables: changedVariables,
        comparison_type: type,
        is_valid_controlled: type === "strictly_controlled" || type === "replication"
    };
}

function controlledComparison(runA, runB) {
    const methodology = analyzeComparisonMethodology(runA, runB);
    const comparison = compareRuns(runA, runB);

    return {
        ...comparison,
        methodology
    };
}

/* ============================================================
   29. CONFRONTO MULTIPLO & DELTA PUNTO-PER-PUNTO
   ============================================================ */

function compareMultipleRuns(runResults) {
    const comparisons = [];
    for (let i = 0; i < runResults.length; i++) {
        for (let j = i + 1; j < runResults.length; j++) {
            comparisons.push(detailedComparison(runResults[i], runResults[j]));
        }
    }
    return comparisons;
}

function comparePoints(runA, runB) {
    const mapA = new Map(runA.normalized.map(item => [item.point_id, item]));
    const mapB = new Map(runB.normalized.map(item => [item.point_id, item]));
    const pointIds = new Set([...mapA.keys(), ...mapB.keys()]);
    const result = [];

    for (const pointId of pointIds) {
        const a = mapA.get(pointId);
        const b = mapB.get(pointId);
        result.push({
            point_id: pointId,
            run_a: a ? { coverage: a.coverage, status: a.status } : null,
            run_b: b ? { coverage: b.coverage, status: b.status } : null
        });
    }
    return result;
}

function calculateStatusTransitions(runA, runB) {
    const points = comparePoints(runA, runB);
    const transitions = {};
    for (const point of points) {
        const a = point.run_a?.status;
        const b = point.run_b?.status;
        if (!a || !b) continue;
        
        if (a === b) continue; 

        const key = `${a}__to__${b}`;
        transitions[key] = (transitions[key] || 0) + 1;
    }
    return transitions;
}

function calculateBehaviorTransitions(runA, runB) {
    const a = runA.profile?.behavior;
    const b = runB.profile?.behavior;

    if (!a || !b) return {};

    const transitions = {};

    for (const dimension of Object.keys(b.observations || {})) {
        const from = a.observations?.[dimension];
        const to = b.observations?.[dimension];

        if (from === undefined || to === undefined) continue;

        const key = `${dimension}:${from}__to__${to}`;
        transitions[key] = (transitions[key] || 0) + 1;
    }

    return transitions;
}

function detailedComparison(runA, runB) {
    const base = controlledComparison(runA, runB);
    return {
        ...base,
        point_deltas: comparePoints(runA, runB),
        status_transitions: calculateStatusTransitions(runA, runB),
        behavior_transitions: calculateBehaviorTransitions(runA, runB)
    };
}

/* ============================================================
   30-33. ESECUZIONI RIPETUTE & STATISTICHE AGGREGATE
   ============================================================ */

function groupByModel(runResults) {
    const groups = {};
    for (const run of runResults) {
        const key = run.metrics.model_id ?? "unknown_model";
        if (!groups[key]) groups[key] = [];
        groups[key].push(run);
    }
    return groups;
}

function groupByPrompt(runResults) {
    const groups = {};
    for (const run of runResults) {
        const key = run.metrics.prompt_id ?? "unknown_prompt";
        if (!groups[key]) groups[key] = [];
        groups[key].push(run);
    }
    return groups;
}

function groupByContext(runResults) {
    const groups = {};
    for (const run of runResults) {
        const key = run.metrics.context_id ?? "unknown_context";
        if (!groups[key]) groups[key] = [];
        groups[key].push(run);
    }
    return groups;
}

function groupByExactConfiguration(runResults) {
    const groups = {};
    for (const run of runResults) {
        const model = run.metrics.model_id ?? "unknown";
        const prompt = run.metrics.prompt_id ?? "unknown";
        const ctxArray = [...(run.metrics.context_document_ids || [])].sort().join("|");
        const key = `${model}__${prompt}__${ctxArray}`;
        
        if (!groups[key]) groups[key] = [];
        groups[key].push(run);
    }
    return groups;
}

function aggregateRuns(runs) {
    if (!runs.length) return null;

    const metricsList = [
        "coverage_raw", "coverage_weighted", "quality", "addressed_quality",
        "usable_information", "effective_information", "omission_rate",
        "error_rate", "hallucination_rate", "over_rate", "inference_rate",
        "relation_consistency", "input_exposure",
        "irony_recognition_rate", "tone_adaptation_rate", "direct_response_rate", "refusal_rate"
    ];

    const result = {};
    for (const metric of metricsList) {
        result[metric] = calculateStats(runs.map(run => run.metrics[metric]));
    }

    return {
        run_count: runs.length,
        metrics: result
    };
}

/* ============================================================
   34. PROFILI DI ESECUZIONE & COMPORTAMENTO
   ============================================================ */

function buildBehaviorProfile(runResult) {
    const behavioral = runResult.behavioral_test;

    if (!behavioral || !behavioral.enabled) {
        return null;
    }

    return {
        dimensions: behavioral.dimensions || [],
        variables: behavioral.controlled_variables || {},
        observations: behavioral.observations || {},
        transitions: behavioral.transitions || {}
    };
}

function buildRunProfile(runResult) {
    const metrics = runResult.metrics;
    return {
        run_id: metrics.run_id,
        identity: {
            model: metrics.model_id,
            prompt: metrics.prompt_id,
            context: metrics.context_id,
            context_docs: metrics.context_document_ids,
            test: metrics.test_id
        },
        coverage: {
            raw: metrics.coverage_raw,
            weighted: metrics.coverage_weighted,
            distribution: metrics.coverage_counts
        },
        quality: {
            global: metrics.quality,
            addressed: metrics.addressed_quality
        },
        information: {
            usable: metrics.usable_information,
            effective: metrics.effective_information
        },
        failures: {
            omission: metrics.omission_rate,
            error: metrics.error_rate,
            hallucination: metrics.hallucination_rate,
            over: metrics.over_rate,
            inference: metrics.inference_rate
        },
        relations: {
            count: metrics.relation_count,
            consistency: metrics.relation_consistency
        },
        input: {
            exposure: metrics.input_exposure,
            profile: metrics.input_profile
        },
        behavior: buildBehaviorProfile(runResult)
    };
}

/* ============================================================
   35. MOTORE PRINCIPALE (ENGINE CORE)
   ============================================================ */

function evaluateRun({ run, groundTruth, evaluation }) {
    const result = calculateRunMetrics({ run, groundTruth, evaluation });
    if (!result.valid) return result;
    return { ...result, profile: buildRunProfile(result) };
}

function evaluateExperiment({ experiment, groundTruth, evaluations }) {
    const runs = [];
    for (const run of experiment.runs) {
        const evaluation = evaluations[run.run_id];
        if (!evaluation) continue;
        const result = evaluateRun({ run, groundTruth, evaluation });
        runs.push(result);
    }

    const validRuns = runs.filter(run => run.valid);

    return {
        experiment_id: experiment.experiment_id,
        run_count: validRuns.length,
        runs: validRuns,
        comparisons: compareMultipleRuns(validRuns),
        
        model_groups: Object.fromEntries(Object.entries(groupByModel(validRuns)).map(([k, v]) => [k, aggregateRuns(v)])),
        prompt_groups: Object.fromEntries(Object.entries(groupByPrompt(validRuns)).map(([k, v]) => [k, aggregateRuns(v)])),
        context_groups: Object.fromEntries(Object.entries(groupByContext(validRuns)).map(([k, v]) => [k, aggregateRuns(v)])),
        
        repeated_runs_statistics: Object.fromEntries(Object.entries(groupByExactConfiguration(validRuns)).map(([k, v]) => [k, aggregateRuns(v)])),
        
        model_prompt_matrix: (function buildModelPromptMatrix(runResults) {
            const matrix = {};
            for (const r of runResults) {
                const model = r.metrics.model_id ?? "unknown_model";
                const prompt = r.metrics.prompt_id ?? "unknown_prompt";
                if (!matrix[model]) matrix[model] = {};
                if (!matrix[model][prompt]) matrix[model][prompt] = [];
                matrix[model][prompt].push(r);
            }
            return matrix;
        })(validRuns)
    };
}

/* ============================================================
   36. ESPORTAZIONE DEL REPORT FINALE
   ============================================================ */

function buildExperimentReport({ experiment, groundTruth, evaluations }) {
    const evaluated = evaluateExperiment({ experiment, groundTruth, evaluations });
    return {
        schema: "diber-evaluation-v0.3",
        deterministic: true,
        ai_judge: false,
        experiment_id: evaluated.experiment_id,
        run_count: evaluated.run_count,
        runs: evaluated.runs,
        comparisons: evaluated.comparisons,
        groups: {
            models: evaluated.model_groups,
            prompts: evaluated.prompt_groups,
            contexts: evaluated.context_groups,
            exact_configurations: evaluated.repeated_runs_statistics
        },
        matrix: evaluated.model_prompt_matrix
    };
}

/* ============================================================
   37. ADATTATORE SPA (Single Page Application Adapter)
   ============================================================ */

function extractEngineDataFromSPA(spaState) {
    const groundTruth = { 
        points: [], 
        relations: spaState.meta?.relations || [] 
    };
    
    const evaluations = {};

    for (const response of spaState.responses || []) {
        evaluations[response.id] = {
            evaluations: [],
            input_data_assessment: response.inputDataAssessment || null
        };
    }

    for (const doc of spaState.documents || []) {
        for (const point of doc.points || []) {
            groundTruth.points.push({
                point_id: point.id,
                importance: point.importance || "undefined",
                weight: point.weight,
                source_document_id: doc.id
            });

            for (const response of spaState.responses || []) {
                const evalData = point.evals?.[response.id] || {};
                evaluations[response.id].evaluations.push({
                    point_id: point.id,
                    coverage: evalData.coverage || "unrated",
                    status: evalData.status || "unrated",
                    excerpt: evalData.excerpt || "",
                    note: evalData.note || ""
                });
            }
        }
    }

    const experiment = {
        experiment_id: "CURRENT_DIBER_STATE",
        runs: (spaState.responses || []).map(r => ({
            run_id: r.id,
            model_id: r.analysisMeta?.evaluator || "unknown",
            prompt_id: r.prompt ? "prompt_" + r.id : "unknown",
            context_document_ids: r.contextDocs || spaState.documents.map(d => d.id),
            test_id: r.id,
            behavioral_test: r.behavioral_test || { enabled: false }
        }))
    };

    return { experiment, groundTruth, evaluations };
}

module.exports = {
    buildExperimentReport,
    evaluateExperiment,
    evaluateRun,
    extractEngineDataFromSPA,
    CB_CONFIG
};