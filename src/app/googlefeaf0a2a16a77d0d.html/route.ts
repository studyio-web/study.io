export const dynamic = 'force-static';

export function GET() {
  return new Response('google-site-verification: googlefeaf0a2a16a77d0d.html\n', {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}
