export function releasePrBody({ tag, packageName }: { tag: string; packageName: string }) {
  return `Bumps **@parshjs/${packageName}**, regenerates its changelog from package-specific commits, and updates the Bun lockfile.

After merging, tag the merge commit on main and push to trigger publishing:

\`\`\`bash
git switch main
git pull --ff-only
git tag ${tag}
git push origin ${tag}
\`\`\`
`;
}
