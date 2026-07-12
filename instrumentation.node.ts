import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { Resource } from "@opentelemetry/resources";
import {
	BatchSpanProcessor,
	NodeTracerProvider,
} from "@opentelemetry/sdk-trace-node";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";

// Parse OTEL_EXPORTER_OTLP_HEADERS ("k1=v1,k2=v2") splitting each pair on the FIRST
// '=' only. The pinned exporter (@opentelemetry 0.39.1) parses this env var itself by
// splitting on EVERY '=', which corrupts base64 auth values (drops the '=' padding)
// and makes the ingest return 401. Parsing here and handing the exporter an explicit
// `headers` record sidesteps that bug while keeping the fleet's env-var contract.
function parseOtlpHeaders(raw: string | undefined): Record<string, string> {
	const headers: Record<string, string> = {};
	if (!raw) return headers;
	for (const pair of raw.split(",")) {
		const eq = pair.indexOf("=");
		if (eq === -1) continue;
		const key = pair.slice(0, eq).trim();
		if (key) headers[key] = pair.slice(eq + 1).trim();
	}
	return headers;
}

// Export traces to the public fleet OTLP/HTTP ingest (traefik-native HTTP Basic auth).
// Config is read directly from process.env — this repo has no t3-env / createEnv layer,
// so bare reads are the existing convention (see app/components/analytics.tsx, Redis.fromEnv()).
//
//   OTEL_EXPORTER_OTLP_ENDPOINT  https://otlp.leonardoacosta.dev  (/v1/traces appended below)
//   OTEL_EXPORTER_OTLP_HEADERS   Authorization=Basic <base64(fleet-otlp:PASSWORD)>
//
// gRPC :4317 is not exposed publicly — OTLP/HTTP only. A bearer-style header 401s.
const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

// Endpoint is the wiring gate: unset (e.g. local dev) -> no exporter registered, no crash.
if (endpoint) {
	const provider = new NodeTracerProvider({
		resource: new Resource({
			[SemanticResourceAttributes.SERVICE_NAME]: "seth-jones",
		}),
	});

	const exporter = new OTLPTraceExporter({
		url: `${endpoint.replace(/\/$/, "")}/v1/traces`,
		headers: parseOtlpHeaders(process.env.OTEL_EXPORTER_OTLP_HEADERS),
	});

	provider.addSpanProcessor(new BatchSpanProcessor(exporter));
	provider.register();
}
