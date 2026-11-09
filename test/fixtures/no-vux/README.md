# `no-vux`

A project root that deliberately has no `node_modules` in it.

Used by the tests that assert what happens when vux is not installed: the
component map cannot be found, and the error has to name the path it looked at
rather than falling back to the repository's own dependencies.

Keep this directory empty apart from this file.
