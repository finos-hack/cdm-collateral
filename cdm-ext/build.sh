#!/usr/bin/env bash
# Generate the local CDM extension (cdm-ext/rosetta, namespace cdmx.*) to Python and test it on top of the
# published finos-cdm package (decision wp-adr-cdm-extension-rune). Needs Java 21+, Python 3.11+, git, curl.
#
# Steps: fetch the Rune Python generator matching CDM's DSL version, CDM's Rune sources and the rune-fpml sources
# CDM depends on; generate CDM + extension together (the extension needs CDM's types to resolve); install the
# published finos-cdm into a virtual environment and add only the generated cdmx package; run the tests.
set -euo pipefail
cd "$(dirname "$0")"

CDM_VERSION="${CDM_VERSION:-7.7.0}"          # published finos-cdm release the extension builds on
GENERATOR_TAG="${GENERATOR_TAG:-10.15.1.0}"  # rune-python-generator release for CDM 7.7.0's DSL (rosetta.dsl.version 10.15.1)
FPML_VERSION="${FPML_VERSION:-3.8.0}"        # rune-fpml version in CDM 7.7.0's pom.xml
WORK="build"
mkdir -p "$WORK"

jar="$WORK/python-$GENERATOR_TAG.jar"
if [ ! -f "$jar" ]; then
  curl -fsSL -o "$jar" "https://github.com/finos/rune-python-generator/releases/download/$GENERATOR_TAG/python-$GENERATOR_TAG.jar"
fi

sparse_fetch() {  # repo url, ref, directory
  if [ ! -d "$3/.git" ]; then
    git init -q "$3"
    git -C "$3" config core.sparseCheckout true
    echo "rosetta-source/src/main/rosetta/*" > "$3/.git/info/sparse-checkout"
    git -C "$3" remote add origin "$1"
  fi
  git -C "$3" fetch -q --depth 1 origin "refs/tags/$2:refs/tags/$2" 2>/dev/null || git -C "$3" fetch -q --depth 1 origin "$2"
  git -C "$3" checkout -q FETCH_HEAD 2>/dev/null || git -C "$3" checkout -q "$2"
}
sparse_fetch https://github.com/finos/common-domain-model.git "$CDM_VERSION" "$WORK/cdm"
sparse_fetch https://github.com/rosetta-models/rune-fpml.git "$FPML_VERSION" "$WORK/fpml"

rm -rf "$WORK/src" "$WORK/generated"
mkdir -p "$WORK/src/rune-fpml"
cp "$WORK"/cdm/rosetta-source/src/main/rosetta/*.rosetta "$WORK/src/"
cp -r "$WORK"/fpml/rosetta-source/src/main/rosetta/* "$WORK/src/rune-fpml/"
cp rosetta/*.rosetta "$WORK/src/"
java -cp "$jar" com.regnosys.rosetta.generator.python.PythonCodeGeneratorCLI \
  -s "$WORK/src" -t "$WORK/generated" -p finos-cdm-ext -x finos -v "$CDM_VERSION" > "$WORK/generate.log" 2>&1
# The generator logs validation errors and skips the model; fail if any cdmx model was skipped.
if grep -E "Skipping model cdmx|Validation ERROR in cdmx" "$WORK/generate.log"; then
  echo "Extension failed validation; see $WORK/generate.log" >&2
  exit 1
fi

if [ ! -x "$WORK/venv/bin/python" ]; then
  python3 -m venv "$WORK/venv"
  "$WORK/venv/bin/pip" install -q "finos-cdm==$CDM_VERSION" pytest
fi
site=$("$WORK/venv/bin/python" -c "import sysconfig; print(sysconfig.get_paths()['purelib'])")
rm -rf "$site/finos/cdmx"
cp -r "$WORK/generated/src/finos/cdmx" "$site/finos/"

cd tests
PYTHONPATH=. "../$WORK/venv/bin/python" -m pytest -q -p no:cacheprovider
