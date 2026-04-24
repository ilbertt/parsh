type GenericPackageJson = {
  dependencies: Record<string, string>;
};

export async function setPackageJsonDependencies({
  sourcePackageJsonPath,
  targetPackageJsonPath,
}: {
  sourcePackageJsonPath: string;
  targetPackageJsonPath: string;
}) {
  const sourcePackageJson: GenericPackageJson = await Bun.file(sourcePackageJsonPath).json();
  const targetPackageJson: GenericPackageJson = await Bun.file(targetPackageJsonPath).json();

  const updatedTargetPackageJson = {
    ...targetPackageJson,
    dependencies: {
      ...targetPackageJson.dependencies,
      ...removeWorkspaceDependencies(sourcePackageJson.dependencies || {}),
    },
  };

  // Add trailing newline to make formatter happy
  await Bun.write(targetPackageJsonPath, `${JSON.stringify(updatedTargetPackageJson, null, 2)}\n`);
}

function removeWorkspaceDependencies(
  dependencies: GenericPackageJson['dependencies'],
): GenericPackageJson['dependencies'] {
  return Object.fromEntries(
    Object.entries(dependencies).filter(([_, value]) => !value.startsWith('workspace:')),
  );
}
