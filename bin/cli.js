#!/usr/bin/env node
const fs = require('fs');
const { parseArgs } = require('util');
const { buildExperimentReport } = require('../engine.js');

const args = process.argv.slice(2);
const command = args[0];

if (!command) {
    console.error("Usage: diber <command> [options]");
    process.exit(1);
}

if (command === 'evaluate') {
    const options = {
        truth: { type: 'string' },
        evals: { type: 'string' },
        out: { type: 'string' }
    };
    
    const { values } = parseArgs({ args: args.slice(1), options, strict: false });
    
    if (!values.truth || !values.evals) {
        console.error("Error: The --truth and --evals parameters are required.");
        process.exit(1);
    }

    try {
        const groundTruth = JSON.parse(fs.readFileSync(values.truth, 'utf8'));
        const testRuns = JSON.parse(fs.readFileSync(values.evals, 'utf8'));
        
        const report = buildExperimentReport({ 
            experiment: testRuns.experiment, 
            groundTruth: groundTruth, 
            evaluations: testRuns.evaluations 
        });
        
        if (values.out) {
            fs.writeFileSync(values.out, JSON.stringify(report, null, 2));
            console.log(`Report successfully generated in: ${values.out}`);
        } else {
            console.log(JSON.stringify(report, null, 2));
        }
    } catch (error) {
        console.error("Processing error:", error.message);
        process.exit(1);
    }

} else if (command === 'assert') {
    const options = {
        'max-hallucination': { type: 'string' },
        'min-quality': { type: 'string' },
        'max-math-error': { type: 'string' }
    };
    
    const { values, positionals } = parseArgs({ args: args.slice(1), options, allowPositionals: true, strict: false });
    const reportPath = positionals[0];

    if (!reportPath) {
        console.error("Error: Please specify the report file path (e.g., ./report.json).");
        process.exit(1);
    }

    try {
        const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
        
        if (!report.runs || report.runs.length === 0) {
            console.error("Error: The report contains no valid runs to analyze.");
            process.exit(1);
        }

        const latestRun = report.runs[0].metrics;
        let failed = false;

        if (values['max-hallucination'] !== undefined) {
            const maxHallu = parseFloat(values['max-hallucination']);
            if (latestRun.hallucination_rate > maxHallu) {
                console.error(`❌ Deployment blocked: hallucination_rate (${latestRun.hallucination_rate}) exceeds the maximum allowed threshold of ${maxHallu}.`);
                failed = true;
            }
        }

        if (values['max-math-error'] !== undefined) {
            const maxMath = parseFloat(values['max-math-error']);
            if (latestRun.math_error_rate > maxMath) {
                console.error(`❌ Deployment blocked: math_error_rate (${latestRun.math_error_rate}) exceeds the maximum allowed threshold of ${maxMath}.`);
                failed = true;
            }
        }

        if (values['min-quality'] !== undefined) {
            const minQuality = parseFloat(values['min-quality']);
            if (latestRun.addressed_quality < minQuality) {
                console.error(`❌ Deployment blocked: addressed_quality (${latestRun.addressed_quality}) has fallen below the minimum threshold of ${minQuality}.`);
                failed = true;
            }
        }

        if (failed) {
            process.exit(1);
        } else {
            console.log("✅ Qualitative audit successfully passed. Deployment permitted.");
            process.exit(0);
        }

    } catch (error) {
        console.error("Fatal error during assert execution:", error.message);
        process.exit(1);
    }
} else {
    console.error(`Unknown command: ${command}. Use 'evaluate' or 'assert'.`);
    process.exit(1);
}
