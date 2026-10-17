"""Workarounds for the CDM 7.7.0 Python package (docs/analysis/defects.md D14).

- Import finos._bundle first: importing Asset before anything else is a circular import.
- Building objects that have absent metadata fields fails in rune.runtime's metadata check, also inside generated
  functions; the check is switched off for the process (below). Test data is still built from Rune JSON.
- Stale schemas: the bundle defines its classes with placeholder field types (None), sets the real types afterwards
  and rebuilds the classes one by one. Pydantic reuses the cached schema of a nested class, together with the
  definitions that schema carries; CDM's types are recursive, so definitions built from the placeholders stay in the
  enclosing schemas (Security.identifier inside Asset, Identifier.assignedIdentifier inside MarginCallIssuance).
  rebuild_all() below discards every cached schema first and then rebuilds all classes (about 5 s at start-up).
- References (payerPartyReference and similar) reject None for an absent optional value when validate_model
  revalidates the object, and reject the copy-on-write proxies that generated functions pass; the reference
  validator is wrapped to accept None and to unwrap proxies (below).
- Generated cdmx modules use names they do not import: constructors of CDM types that the bundle names by full path
  (finos_cdm_event_common_TransferState), and functions called inside extract. link_cdmx() below adds the missing
  bundle classes and cdmx functions to every cdmx module.
- Deep copies follow parent links: rune.runtime keeps each object's parent in its __dict__, so copy.deepcopy of a
  child (copy-on-write in generated functions, rune_unwrap) copies the whole enclosing tree, and through an event's
  before state every earlier event; copying grows with each step (minutes per step after two steps) and ends in
  RecursionError. BaseDataClass.__deepcopy__ is replaced below: it copies the object and its children and keeps the
  parent link pointing at the original parent.
- Dates and times with metadata (adjustedDate and similar) cannot be deep-copied: datetime pickles its value as
  bytes, which DateWithMeta rejects. A __deepcopy__ that rebuilds them from their ISO text is added (below).
- CDM's own conditions are still skipped when test data is loaded (check_rune_constraints=False): tests check the
  extension's conditions explicitly (failed_conditions).
"""
import copy
import importlib
import inspect
import json
import pkgutil

from pydantic._internal import _mock_val_ser
from pydantic_core import PydanticUndefined
from rune.runtime.cow import rune_unwrap
from rune.runtime.metadata import (PARENT_PROP, BaseMetaDataMixin, ComplexTypeMetaDataMixin, DateTimeWithMeta,
                                   DateWithMeta, TimeWithMeta)

# Must run before finos._bundle is imported: the bundle binds the validator function when its annotations are built.
_deserialize = ComplexTypeMetaDataMixin.deserialize.__func__
ComplexTypeMetaDataMixin.deserialize = classmethod(
    lambda cls, obj, allowed_meta: None if obj is None else _deserialize(cls, rune_unwrap(obj), allowed_meta))

import finos._bundle  # noqa: E402,F401
from rune.runtime.base_data_class import BaseDataClass  # noqa: E402

# The metadata check (which metadata keys a field allows) receives None for absent metadata fields when objects are
# built in Python, including inside generated functions, and fails. rune.runtime re-enables the check at the end of
# every validate_model call, so it is switched off by making it report "off" for the whole process.
BaseMetaDataMixin.meta_checks_enabled = classmethod(lambda cls: False)


def _deepcopy(self, memo=None):
    # pydantic's BaseModel.__deepcopy__, with the parent left uncopied and the copy registered in memo before its
    # children are copied (their parent link then points at the copy).
    memo = {} if memo is None else memo
    parent = self.__dict__.get(PARENT_PROP)
    if parent is not None:
        memo.setdefault(id(parent), parent)
    m = type(self).__new__(type(self))
    memo[id(self)] = m
    object.__setattr__(m, "__dict__", copy.deepcopy(self.__dict__, memo))
    object.__setattr__(m, "__pydantic_extra__", copy.deepcopy(self.__pydantic_extra__, memo))
    object.__setattr__(m, "__pydantic_fields_set__", set(self.__pydantic_fields_set__))
    private = getattr(self, "__pydantic_private__", None)
    object.__setattr__(m, "__pydantic_private__", None if private is None else copy.deepcopy(
        {k: v for k, v in private.items() if v is not PydanticUndefined}, memo))
    return m


BaseDataClass.__deepcopy__ = _deepcopy


def _deepcopy_dated(self, memo):
    m = type(self)(self.isoformat())
    memo[id(self)] = m
    m.__dict__.update(copy.deepcopy(self.__dict__, memo))
    return m


for _dated in (DateWithMeta, DateTimeWithMeta, TimeWithMeta):
    _dated.__deepcopy__ = _deepcopy_dated


def rebuild_all() -> int:
    def subclasses(c):
        for s in c.__subclasses__():
            yield s
            yield from subclasses(s)
    classes = [c for c in dict.fromkeys(subclasses(BaseDataClass)) if c.__module__.startswith("finos")]
    for c in classes:
        c.__pydantic_complete__ = False
        _mock_val_ser.set_model_mocks(c)
    for c in classes:
        c.model_rebuild()
    return len(classes)


def link_cdmx() -> None:
    import finos.cdmx
    modules = [importlib.import_module(m.name) for m in pkgutil.walk_packages(finos.cdmx.__path__, "finos.cdmx.")]
    names = {k: v for k, v in vars(finos._bundle).items() if k.startswith("finos_") and inspect.isclass(v)}
    names |= {k: v for m in modules for k, v in vars(m).items()
              if inspect.isfunction(v) and v.__module__ == m.__name__ and k == m.__name__.rsplit(".", 1)[1]}
    for m in modules:
        for k, v in names.items():
            m.__dict__.setdefault(k, v)


link_cdmx()
rebuild_all()


def load(type_name: str, doc: dict, check_conditions: bool = False):
    return BaseDataClass.rune_deserialize(
        json.dumps({"@type": type_name, "@model": "finos", "@version": "7.7.0", **doc}),
        check_rune_constraints=check_conditions)


def failed_conditions(obj) -> str:
    """Names of the object's own failed conditions (not its children's: CDM's are not checked, see above)."""
    return " ".join(str(e) for e in rune_unwrap(obj).validate_conditions(recursively=False, raise_exc=False))
