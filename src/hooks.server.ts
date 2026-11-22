import type { Handle } from '@sveltejs/kit';
import { GA_MEASUREMENT_ID, IS_STAGING } from '$lib/env';

const SAFE_GA_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

function buildGtagSnippet(measurementId: string): string {
	if (!SAFE_GA_ID_PATTERN.test(measurementId)) return '';
	return [
		'\t\t<!-- Google tag (gtag.js) -->',
		`\t\t<script async src="https://www.googletagmanager.com/gtag/js?id=${measurementId}"></script>`,
		'\t\t<script>',
		'\t\t  window.dataLayer = window.dataLayer || [];',
		'\t\t  function gtag(){dataLayer.push(arguments);}',
		"\t\t  gtag('js', new Date());",
		`\t\t  gtag('config', '${measurementId}');`,
		'\t\t</script>'
	].join('\n');
}

export const handle: Handle = ({ event, resolve }) =>
	resolve(event, {
		transformPageChunk: ({ html }) => {
			let transformed = html;

			if (IS_STAGING) {
				transformed = transformed
					.replace('<title>', '<title>[Staging] ')
					.replace(
						'</head>',
						'\t\t<meta name="robots" content="noindex, nofollow" />\n\t</head>'
					);
			}

			if (GA_MEASUREMENT_ID) {
				const snippet = buildGtagSnippet(GA_MEASUREMENT_ID);
				if (snippet) {
					transformed = transformed.replace('</head>', `${snippet}\n\t</head>`);
				}
			}

			return transformed;
		}
	});
