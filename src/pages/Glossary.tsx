import { Link } from "react-router-dom";

/**
 * Reference page for the terms the data views depend on. Moved off the landing
 * page but kept on the site, since the affordability map is hard to read without
 * knowing what "60% AMI" actually means.
 */
export function Glossary() {
  return (
    <div className="page-narrow">
      <p className="eyebrow">Reference</p>
      <h1 className="page-title">How to read these numbers</h1>
      <p className="page-lede">
        Housing policy runs on jargon. A few terms do most of the work across this site, and getting
        them straight changes what the numbers mean.
      </p>

      <dl className="glossary">
        <div>
          <dt>AMI — Area Median Income</dt>
          <dd>
            The midpoint income for the Chicago region, set annually by the federal government. A
            household at <strong>100% AMI</strong> earns exactly that midpoint; one at{" "}
            <strong>60% AMI</strong> earns 60% of it. Affordability is conventionally measured
            against the 30%-of-income rule: housing is "affordable" to a household if it costs no
            more than 30% of what they earn. So "affordable at 60% AMI" means a household earning
            60% of the regional median could rent it without being cost-burdened.
          </dd>
        </div>
        <div>
          <dt>ARO — Affordable Requirements Ordinance</dt>
          <dd>
            Chicago's rule requiring many new developments to include affordable units. It also
            publishes maximum rents by unit size, which is why our 60% AMI figures use a{" "}
            <strong>different cap for a studio than for a four-bedroom</strong> — a more accurate
            approach than one flat citywide number, since larger households need larger homes.
          </dd>
        </div>
        <div>
          <dt>Cost-burdened</dt>
          <dd>
            A household spending more than <strong>30% of its income</strong> on housing. Above 50%
            is "severely cost-burdened." It's the standard threshold behind most affordability
            measures, including the ones on this site.
          </dd>
        </div>
        <div>
          <dt>Listings vs. housing stock</dt>
          <dd>
            The affordability map counts <strong>listings</strong> — homes actively on the market
            right now — not all housing in a ward. A ward with cheap listings today can reprice as
            the market moves, and a ward with few listings tells you little about what people
            already living there pay.
          </dd>
        </div>
      </dl>

      <p className="stub-back">
        <Link to="/affordability">See the affordability data →</Link>
      </p>
    </div>
  );
}
