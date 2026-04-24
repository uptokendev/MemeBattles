import { runPhase7SyntheticSimulation } from "../rewards/phase7Simulation.js";

async function main() {
  const result = runPhase7SyntheticSimulation();
  console.log(JSON.stringify(result, null, 2));

  const failed = Object.entries(result.checks).filter(([, passed]) => !passed);
  if (failed.length > 0) {
    throw new Error(`Phase 7 simulation failed: ${failed.map(([name]) => name).join(", ")}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("runPhase7Simulation failed", err);
    process.exit(1);
  });
