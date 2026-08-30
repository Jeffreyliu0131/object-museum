import { Badge, Button } from "@radix-ui/themes";
import { ArrowRight, Flask, Plus } from "@phosphor-icons/react";

export interface FixtureCardData {
  id: string;
  title: string;
  objectName: string;
  summary: string;
  imageUrl: string;
  imageAlt: string;
}

interface CollectionScreenProps {
  fixtures: FixtureCardData[];
  hasWorkingCopy: boolean;
  onOpenWorkingCopy: () => void;
  onStartFixture: (fixtureId: string) => void;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}

export function CollectionScreen({
  fixtures,
  hasWorkingCopy,
  onOpenWorkingCopy,
  onStartFixture,
  headingRef,
}: CollectionScreenProps) {
  const [featured, ...rest] = fixtures;

  return (
    <section className="page collection-page" aria-labelledby="collection-title">
      <header className="page-header">
        <div className="page-header__copy">
          <p className="eyebrow">Single-user first exhibit</p>
          <h1 id="collection-title" ref={headingRef} tabIndex={-1}>
            A local workbench for one object story
          </h1>
          <p className="lede">
            Keep the object, the narrator&apos;s exact words and every reviewed statement visibly connected. No model, account or upload is required.
          </p>
        </div>
      </header>

      <section className="empty-state local-working-state" aria-labelledby="working-copy-title">
        <div className="empty-state__inner">
          <span className="empty-state__mark" aria-hidden="true"><Flask size={26} /></span>
          <div>
            <p className="eyebrow">Local prototype state</p>
            <h2 id="working-copy-title">{hasWorkingCopy ? "One local working copy is ready" : "No local working copy"}</h2>
            <p>
              {hasWorkingCopy
                ? "Continue the one active exhibit stored by this browser prototype."
                : "Choose the cobalt mug fixture below to create a synthetic working copy. Bundled samples are code assets, not restored user data."}
            </p>
          </div>
          <div className="empty-state__actions">
            {hasWorkingCopy ? (
              <Button className="button button--primary" size="3" onClick={onOpenWorkingCopy}>
                Open working copy <ArrowRight size={18} />
              </Button>
            ) : featured ? (
              <Button className="button button--primary" size="3" onClick={() => onStartFixture(featured.id)}>
                <Plus size={18} /> Start with synthetic fixture
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      <div className="section-heading">
        <div>
          <p className="eyebrow">Code-bundled samples</p>
          <h2>Sample collection</h2>
        </div>
        <p>Three synthetic fixtures for layout and interaction review. They are not repeat-use evidence.</p>
      </div>

      {featured ? (
        <div className="collection-layout">
          <article className="collection-feature fixture-card--feature">
            <figure className="collection-feature__media fixture-card__media">
              <img src={featured.imageUrl} alt={featured.imageAlt} width="960" height="1200" fetchPriority="high" />
            </figure>
            <div className="collection-feature__body fixture-card__body">
              <Badge className="synthetic-label" variant="outline">Synthetic fixture</Badge>
              <p className="eyebrow">Interactive example</p>
              <h3>{featured.title}</h3>
              <p>{featured.summary}</p>
              <Button
                className="button button--secondary"
                variant="outline"
                disabled={hasWorkingCopy}
                onClick={() => onStartFixture(featured.id)}
              >
                {hasWorkingCopy ? "Finish or clear the active copy first" : "Use this fixture"}
              </Button>
            </div>
          </article>

          <div className="collection-list fixture-list" aria-label="Additional synthetic fixtures">
            {rest.map((fixture) => (
              <article className="fixture-row" key={fixture.id}>
                <figure className="fixture-row__media">
                  <img src={fixture.imageUrl} alt={fixture.imageAlt} width="960" height="1200" loading="lazy" />
                </figure>
                <div className="fixture-row__body">
                  <Badge className="synthetic-label" variant="outline">Synthetic fixture</Badge>
                  <h3 className="fixture-row__title">{fixture.title}</h3>
                  <p className="fixture-row__summary">{fixture.summary}</p>
                  <span className="status-label">Read-only sample</span>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
