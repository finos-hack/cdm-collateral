"""Workarounds for the CDM 7.7.0 Python package (docs/analysis/defects.md D14).

- Import finos._bundle first: importing Asset before anything else is a circular import.
- Building objects that have absent metadata fields fails in rune.runtime's metadata check, also inside generated
  functions; the check is switched off for the process (below). Test data is still built from Rune JSON.
- Asset types keep unresolved forward references (Security.identifier is typed None; Cash raises NameError for
  CurrencyCodeEnum), so a collateral position cannot carry its asset. Test data is therefore loaded with
  check_rune_constraints=False (CDM's PositionBase.ProductOrAsset would fail), and tests check the extension's
  own conditions explicitly.
"""
import json

import finos._bundle  # noqa: F401
from rune.runtime.base_data_class import BaseDataClass
from rune.runtime.metadata import BaseMetaDataMixin

# The metadata check (which metadata keys a field allows) receives None for absent metadata fields when objects are
# built in Python, including inside generated functions, and fails. rune.runtime re-enables the check at the end of
# every validate_model call, so it is switched off by making it report "off" for the whole process.
BaseMetaDataMixin.meta_checks_enabled = classmethod(lambda cls: False)


def load(type_name: str, doc: dict, check_conditions: bool = False):
    return BaseDataClass.rune_deserialize(
        json.dumps({"@type": type_name, "@model": "finos", "@version": "7.7.0", **doc}),
        check_rune_constraints=check_conditions)


def failed_conditions(obj) -> str:
    """Names of the object's own failed conditions (not its children's: CDM's would fail, see above)."""
    from rune.runtime.cow import rune_unwrap
    return " ".join(str(e) for e in rune_unwrap(obj).validate_conditions(recursively=False, raise_exc=False))
