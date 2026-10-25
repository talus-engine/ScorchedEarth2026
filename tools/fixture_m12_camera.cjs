// Immediate-arrival E52 contract double for older policy suites. Delayed
// streaming/motion is exercised separately by check_m12_camera.cjs.
function cameraMock(resolve, viewport = { x: 5700, y: 100, w: 1600, h: 968 }, requests = []) {
  let serial = 0
  return {
    view: { viewport }, tracking: null, requests,
    track(target, options = {}) {
      const entityId = target.entity && (typeof target.entity === 'string' ? target.entity : target.entity.id)
      const at = target.point || resolve(entityId)?.position || null
      const normalized = entityId ? { entityId } : { point: { ...target.point } }
      requests.push({ target: normalized, options: { ...options } })
      this.tracking = { id: ++serial, phase: at ? 'arrived' : 'unresolved', target: normalized,
        center: at ? { ...at } : this.tracking?.center || { x: 0, y: 0 }, targetPoint: at && { ...at },
        distance: at ? 0 : null, tolerance: options.tolerance ?? 12, ready: !!at, reason: at ? null : 'entity-unresolved' }
      return this.tracking
    },
    hold() { if (this.tracking) this.tracking = { ...this.tracking, phase: 'held', ready: false, reason: 'held' }; return this.tracking },
  }
}
module.exports = { cameraMock }
