import { NotFoundLayout } from "@pagesmith/site/layouts";
import type { SiteDocumentData } from "@pagesmith/site/components";

type Props = {
  slug: string;
  site: SiteDocumentData;
};

export default function NotFoundPage({ slug, site }: Props) {
  return <NotFoundLayout slug={slug} site={site} />;
}
