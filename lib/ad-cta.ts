export const adCtaLabels = [
  'Visit Profile',
  'Visit website',
  'Send Message',
  'See details',
  'Learn More',
  'Shop now',
  'Watch more',
  'Contact us',
  'Book now',
  'Sign up',
  'Subscribe',
  'Order now',
  'Get Offer',
  'Listen now',
  'Check availability',
  'Register',
  'Apply',
  'Get started',
] as const;

const canonicalLabels = new Map(
  adCtaLabels.map((label) => [label.toLocaleLowerCase(), label]),
);

export function normalizeAdCtaLabel(value: unknown) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return canonicalLabels.get(trimmed.toLocaleLowerCase()) ?? trimmed;
}
