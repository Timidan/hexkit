;; Real Gear WASM fixture: 01 increments, 00 reads, ff traps.
;; State at byte 256 survives subsequent message executions.
(module
  (import "env" "memory" (memory 1))
  (import "env" "gr_read" (func $read (param i32 i32 i32 i32)))
  (import "env" "gr_reply" (func $reply (param i32 i32 i32 i32)))
  (func (export "init"))
  (func (export "handle")
    (call $read (i32.const 0) (i32.const 1) (i32.const 32) (i32.const 64))
    (if (i32.eq (i32.load8_u (i32.const 32)) (i32.const 255)) (then unreachable))
    (i32.store (i32.const 256) (i32.add (i32.load (i32.const 256)) (i32.load8_u (i32.const 32))))
    (call $reply (i32.const 256) (i32.const 4) (i32.const -1) (i32.const 64))
  )
)
