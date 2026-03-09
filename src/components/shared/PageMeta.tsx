import { Helmet } from "react-helmet-async";

interface PageMetaProps {
  title: string;
  description: string;
}

const SITE_NAME = "HexKit";

/**
 * Per-route dynamic <title> tag.
 *
 * Static meta tags (description, OG, Twitter Cards, canonical, structured data)
 * live in index.html for social bots and crawlers that don't execute JS.
 * Helmet only manages the <title> for in-browser tab labeling.
 */
export function PageMeta({ title, description: _description }: PageMetaProps) {
  const fullTitle = `${title} | ${SITE_NAME}`;

  return (
    <Helmet>
      <title>{fullTitle}</title>
    </Helmet>
  );
}
