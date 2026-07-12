// OpenTelemetry instrumentation hook (Next.js `experimental.instrumentationHook`).
// Runs once per server process at startup. Node-only: the OTLP SDK cannot run in
// the edge runtime, so guard on NEXT_RUNTIME before importing the Node setup.
export async function register() {
	if (process.env.NEXT_RUNTIME === "nodejs") {
		await import("./instrumentation.node");
	}
}
