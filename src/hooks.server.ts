import type { Handle } from '@sveltejs/kit';
import { IS_STAGING } from '$lib/env';

export const handle: Handle = ({ event, resolve }) =>
	resolve(event, {
		transformPageChunk: ({ html }) => {
			if (!IS_STAGING) return html;
			return html
				.replace('<title>', '<title>[Staging] ')
				.replace('</head>', '\t\t<meta name="robots" content="noindex, nofollow" />\n\t</head>');
		}
	});
