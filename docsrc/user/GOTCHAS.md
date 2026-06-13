# Gotchas

## Flow shows "timeout" immediately

Default port is `8501`, not `1025`.

Fix: open the `kvhostlink-connection` node and set Port to `8501`.

## Timer/counter preset write returns an error

Preset writes (`WS`/`WSS`) only work on KV-8000/7000-series CPU units.

Fix: do not write `T` or `C` presets on other models.

## X or Y address is rejected

`X` and `Y` use decimal-bank plus hex-bit notation.

Fix: use `X10F`, not `X275`.

## R, MR, LR, or CR address is rejected

Two-digit bit notation is required for these bit-bank families.

Fix: use `R200`, not a hex-only form.

## DM100.D returns a bit, not a dword

The dot form means bit-in-word access.

Fix: use `DM100:D` for an unsigned 32-bit value.

## COMMENT write is rejected

`:COMMENT` is read-only through the high-level API.

Fix: use `DM145:COMMENT` only with `kvhostlink-read`.

## Count with bit-in-word is rejected

Bit-in-word addresses do not support `,count`.

Fix: use `DM150.3` for one bit, or use a direct bit family such as `R200,4` for bit arrays.
