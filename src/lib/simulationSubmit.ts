export interface SimulationSubmitOutcome {
  failedCount: number;
  totalCount: number;
  canClearSession: boolean;
}

export function evaluateSimulationOutcome(
  results: PromiseSettledResult<unknown>[],
): SimulationSubmitOutcome {
  const failedCount = results.filter(r => r.status === 'rejected').length;
  return {
    failedCount,
    totalCount: results.length,
    canClearSession: failedCount === 0,
  };
}
