  //"use strict";

/* Motion controls to move & rotate blocks in 3D space.
 *
 * The control mechanism used is a semi-transparent proxy object which is
 * is positioned at the location of the player's 6DoF controller, matching the
 * orientation (rotation) of the target object.
 *
 * Default controls are:
 * - Grip to move (and not rotate)
 * - Trigger to rotate (and not move)
 * - Grip & Trigger to move & rotate at the same time.
 * - When Grip & Trigger are both released, the controller can be moved freely
 *   with no impact on the target object.
 *
 * In terms of code, there are 2 key components:
 * - motion-block-controls is a component configured on the object to be
 *   controlled, the "Target".  It has to be configured with the ID of the
 *   proxy object.
 * - proxy-controller is a component configured on the entity representing
 *    the proxy object.  It has to be configured with the IDs of both the Target
 *    object & the Controller entity.
 *
 * For debug purposes in VR, both components output state to logger objects
 * that can be configured.
*/

/* This component is configured on the Target
 * with config indicating the proxy */
AFRAME.registerComponent('motion-block-controls', {

  schema: {
    proxy:      {type: 'string', default: "#target-proxy"},
    logger:     {type: 'string', default: "#log-panel"},
    debug:      {type: 'boolean', default: false},
    posunit:    {type: 'number', default: 0.1},
    rotunit:    {type: 'number', default: 90},
  },

  init: function () {

    // This can be useful for debugging.
    //this.tick = AFRAME.utils.throttleTick(this.tick, 100, this);

    // State tracking.  We attach when we receive an "attach" event from the
    // proxy component.
    this.attached = false;

    // Last position reported state.
    // This is used to determine what position & rotation events to pass
    // into the game engine.
    this.lastReportedPosition = {'x': 0, 'y': 0, 'z': 0};
    this.lastReportedRotation = {'x': 0, 'y': 0, 'z': 0};
    copyXYZ(this.el.object3D.position, this.lastReportedPosition);
    copyXYZ(this.el.object3D.rotation, this.lastReportedRotation);

    // Event listeners...
    this.listeners = {
      attach: this.attachToProxy.bind(this),
      detach: this.detachFromProxy.bind(this),
    };
    this.attachEventListeners();
  },

  update: function () {
    // Store rotation unit in Radians, for use internally.
    this.rotationUnit = (Math.PI * this.data.rotunit) / 180;

    // Store reference to proxy.
    this.proxy = document.querySelector(this.data.proxy)
  },

  attachEventListeners: function () {
    this.el.addEventListener('attach', this.listeners.attach, false);
    this.el.addEventListener('detach', this.listeners.detach, false);
  },

  attachToProxy: function () {

    this.attached = true;
    console.log("PROXY ATTACHED----start taking position/rotation info from Proxy to Target");

    // calculating the offset to use when calculating target position from proxy position.
    this.offset = {'x': this.el.object3D.position.x - this.proxy.object3D.position.x,
                   'y': this.el.object3D.position.y - this.proxy.object3D.position.y,
                   'z': this.el.object3D.position.z - this.proxy.object3D.position.z}

    // We don't need a similar offset for rotation, because the approach we take is
    // to always spawn the controller proxy object in a rotation orientation to match
    // the the controlled target.

    // the equivalent offset is between the Proxy and Controller elements.

    if (this.data.debug) {
      console.log(`Offset: x: ${this.offset.x.toFixed(2)}, y: ${this.offset.y.toFixed(2)}, z: ${this.offset.z.toFixed(2)}`)
    }
  },

  detachFromProxy: function () {
     this.attached = false;
     console.log("PROXY DETACHED----stop taking position/rotation info from Proxy to Target");

  },

  tick: function (time, timeDelta) {

    // The Target is only controlled by the Proxy when attached.
    if (this.attached) {

      var logtext = "Target Object - proxy attached\n"

      if (this.data.debug) {

        logtext += logXYZ("Offset: ", this.offset, 2);
        logtext += logXYZ("Proxy: ", this.proxy.object3D.position, 2);
        logtext += logXYZ("Proxy Rot: ", this.proxy.object3D.rotation, 1);

      }

      const x = this.proxy.object3D.position.x;
      const y = this.proxy.object3D.position.y;
      const z = this.proxy.object3D.position.z;

      const xr = this.proxy.object3D.rotation.x;
      const yr = this.proxy.object3D.rotation.y;
      const zr = this.proxy.object3D.rotation.z;

      // The orientation of the target is the same as the proxy
      // but snapped to a position grid, and rotations of 90 degrees.
      // The offset is the (fixed) offset from the target to the proxy.
      const sx = this.targetPositionFromProxy(x, this.offset.x);
      const sy = this.targetPositionFromProxy(y, this.offset.y);
      const sz = this.targetPositionFromProxy(z, this.offset.z);

      this.el.object3D.position.x = sx;
      this.el.object3D.position.y = sy;
      this.el.object3D.position.z = sz;

      const sxr = this.targetRotationFromProxy(xr);
      const syr = this.targetRotationFromProxy(yr);
      const szr = this.targetRotationFromProxy(zr);

      this.el.object3D.rotation.x = sxr;
      this.el.object3D.rotation.y = syr;
      this.el.object3D.rotation.z = szr;

      if (this.data.debug) {
        logtext += logXYZ("Target: ", this.el.object3D.position, 2);
        logtext += logXYZ("Target Rot: ", this.el.object3D.rotation, 1);

        var logPanel = document.querySelector(this.data.logger);
        logPanel.setAttribute('text', "value: " + logtext);
      }

      // Emit events for any changes to rotation or position.
      var posChanged = this.reportChangesToPosition(sx, sy, sz);
      var rotChanged = this.reportChangesToRotation(sxr, syr, szr);
    }
    else if (this.data.debug) {
      // Not attached.  But being able to see co-ordinates is still useful for
      // debug.
      var logtext = "Target Object - not attached to proxy.\n"

      logtext += logXYZ("Proxy: ", this.proxy.object3D.position, 2);
      logtext += logXYZ("Proxy Rot: ", this.proxy.object3D.rotation, 1, true);
      logtext += logXYZ("Target: ", this.el.object3D.position, 2);
      logtext += logXYZ("Target Rot: ", this.el.object3D.rotation, 1, true);

      var logPanel = document.querySelector(this.data.logger);
      logPanel.setAttribute('text', "value: " + logtext);
    }
  },

  // Emit events for any changes to position.  Return an indication whether
  // there were any events emitted.
  reportChangesToPosition: function (x, y, z) {

    var changed = false;
    const xDelta = x - this.lastReportedPosition.x;
    const yDelta = y - this.lastReportedPosition.y;
    const zDelta = z - this.lastReportedPosition.z;

    if (xDelta > 0) {
      this.emitNEvents("xplus", xDelta / this.data.posunit)
      changed = true;
    }
    else if (xDelta < 0) {
      this.emitNEvents("xminus", xDelta / this.data.posunit)
      changed = true;
    }

    if (yDelta > 0) {
      this.emitNEvents("yplus", yDelta / this.data.posunit)
      changed = true;
    }
    else  if (xDelta < 0) {
      this.emitNEvents("yminus", yDelta / this.data.posunit)
      changed = true;
    }

    if (zDelta > 0) {
      this.emitNEvents("zplus", zDelta / this.data.posunit)
      changed = true;
    }
    else if (zDelta < 0) {
      this.emitNEvents("zminus", zDelta / this.data.posunit)
      changed = true;
    }

    // Update record of the position we reported.
    copyXYZ(this.el.object3D.position, this.lastReportedPosition);

    return(changed);
  },

  // Emit events for any changes to rotaton.  Return an indication whether
  // there were any events emitted.
  reportChangesToRotation: function (xr, yr, zr) {
    const xrDelta = xr - this.lastReportedRotation.x;
    const yrDelta = yr - this.lastReportedRotation.y;
    const zrDelta = zr - this.lastReportedRotation.z;
    var changed = false;

    if (xrDelta > 0) {
      this.emitNEvents("xRotPlus", xrDelta / this.rotationUnit)
      changed = true;
    }
    else if (xrDelta < 0) {
      this.emitNEvents("xRotMinus", xrDelta / this.rotationUnit)
      changed = true;
    }

    if (yrDelta > 0) {
      this.emitNEvents("yRotPlus", yrDelta / this.rotationUnit)
      changed = true;
    }
    else if (yrDelta < 0) {
      this.emitNEvents("yRotMinus", yrDelta / this.rotationUnit)
      changed = true;
    }

    if (zrDelta > 0) {
      this.emitNEvents("zRotPlus", zrDelta / this.rotationUnit)
      changed = true;
    }
    else if (zrDelta < 0) {
      this.emitNEvents("zRotMinus", zrDelta / this.rotationUnit)
      changed = true;
    }

    // Update record of the rotation we reported.
    copyXYZ(this.el.object3D.rotation, this.lastReportedRotation);

    return(changed);
  },

  // Utility function to emit events.
  emitNEvents: function(event, count) {

    console.log(`Event: ${event} emitted ${count} times`)
    for (var ii = 0; ii < count; ii++) {
      this.el.emit("xplus");
    }
  },

  // Maps proxy position to target position by applying offset, and
  // snapping to units of positional movement.
  targetPositionFromProxy: function(position, offset) {
    return(Math.round(
           (position + offset)/this.data.posunit) *
           this.data.posunit);
  },

  // Maps proxy rotation to target rotation by snapping to units of rotational
  // movement.  (there is no offset for rotation between Proxy & Target)
  // the offset exists between Controller & Proxy instead, as this makes for
  // better UX.
  targetRotationFromProxy: function(rotation) {
             return(Math.round(
                    (rotation) / this.rotationUnit) *
                    this.rotationUnit);
  }
});


/* This component is configured on the Proxy
 * with config indicating the Target and the Controller
 *
 * Controls currently hardcoded lke this:
 * - Grip to move (and not rotate)
 * - Trigger to rotate (and not move)
 * - Grip & Trigger to move & rotate at the same time.
 * - When Grip & Trigger are both released, the controller can be moved freely
 *   with no impact on the target object.
 * Might be desirable to offer e.g. Grip to contol both rotation & movement.
 * Will need some minor code changes to implement that, or make it configurable.
*/

AFRAME.registerComponent('proxy-controller', {

  schema: {
    controller:  {type: 'string', default: "#rhand"},
    target:      {type: 'string', default: "#target"},
    logger:      {type: 'string', default: "#log-panel"},
    lockrotate:  {type: 'boolean', default: false},
    debug:       {type: 'boolean', default: false},
    usequat:     {type: 'boolean', default: true} // whether to use Quaternion math for rotations.
  },

  init: function () {

    // This can be useful for debugging.
    // this.tick = AFRAME.utils.throttleTick(this.tick, 100, this);
    // Controls config----------------------------------------------------------

    // Rotation lock means that you can only rotate in a single axis, for
    // each "TriggerDown" event.
    // This was added early in development.  Seems to be less valuable now the
    // user has clear visual clues on rotation, so hasn't been tested much,
    // but code is still there.
    this.rotationLockEnabled = this.data.lockrotate;

    // Setting these to "false" would mean you could move while Rotating
    // and rotate while moving.
    // I *think* the result would be that grip & trigger would both operate as
    // "Move and/or Rotate", but haven't tested yet.
    this.gripToMove = true;
    this.triggerToRotate = true;

    // Controls state
    this.triggerDownCRotation = {'x' : 0, 'y': 0, 'z': 0}; // controller
    this.triggerDownPRotation = {'x' : 0, 'y': 0, 'z': 0}; // proxy
    this.triggerDown = false;
    this.rotationLock = "";
    this.gripDownPosition = {'x' : 0, 'y': 0, 'z': 0};
    this.gripDown = false;

    // Maths stuff to handle the offset between rotation of controller &
    // rotation of the proxy.
    // This is typically non-zero because we intentionally align the proxy with
    // the target when we attach.
    //
    // To allow for correct composition of rotations, we use
    // Quaternions for this.

    // Quaternions & Eulers used for working, to avoid creation & deletion within the
    // tick cycle.
    this.quaternionA = new THREE.Quaternion();
    this.quaternionB = new THREE.Quaternion();
    this.quaternionAInverse = new THREE.Quaternion();
    this.quaternionAInverseB = new THREE.Quaternion();
    this.quaternionCRotNow = new THREE.Quaternion();
    this.eulerA = new THREE.Euler(0,0,0);
    this.eulerB = new THREE.Euler(0,0,0);
    this.eulerC = new THREE.Euler(0,0,0);

// These 3 are old... clear them out.
    this.offsetQuaternion = new THREE.Quaternion();
    this.offsetInverseQuaternion = new THREE.Quaternion();
    this.offsetRotation = new THREE.Euler(0, 0, 0);

    // Flag to use non-Quaternion maths. Prone to Gimbal locking, but simpler.
    // switching this on can be useful for debugging, maybe?
    this.useQuaternions = this.data.usequat;

    // References to controller & target.
    this.controller = document.querySelector(this.data.controller)
    this.target = document.querySelector(this.data.target)

    // Proxy controls start off "invisible"...
    // (though still visible in debug mode).
    this.proxyVisible = false;
    this.detachProxyIfNotNeeded();

    // Event listeners...
    this.listeners = {
      triggerdown: this.onTriggerDown.bind(this),
      triggerup: this.onTriggerUp.bind(this),
      gripdown: this.onGripDown.bind(this),
      gripup: this.onGripUp.bind(this)
    };
    this.attachEventListeners();

  },

  update: function () {

    this.controller = document.querySelector(this.data.controller)
    this.target = document.querySelector(this.data.target)
    this.rotationLockEnabled = this.data.lockrotate;
  },

  // Safe to call this if the proxy is already attached/visible:
  // it won't jump control to a new place if the proxy is already visible.
  // (except in debug mode, where the proxy is always visible)
  attachProxy: function () {

    if (!this.proxyVisible) {
      // Set Proxy object position to current controller position.
      copyXYZ(this.controller.object3D.position, this.el.object3D.position)

      // We want to snap to the target's rotation.  TARGET -> PROXY.
      copyXYZ(this.target.object3D.rotation, this.el.object3D.rotation)

      // We have had some problems getting this to work, so here's some
      // logs to see what is going on...
      console.log("UPDATING ROTATION: TARGET -> PROXY")
      logXYZ("Target rotation:", this.target.object3D.rotation, 1, true);
      logXYZ("Proxy rotation:", this.controller.object3D.rotation, 1, true);

    }

    // When we attach the Proxy, we want to be sure the Proxy is visible.
    this.proxyVisible = true;
    this.el.object3D.visible = true;

    // Attach to the target object.  duplicate attachments should be unproblematic.
    // Note that this attach triggers the target object to mimic the position &
    // rotation of the proxy.  So important that this happens *after* the
    // adjustments to the proxy position above.
    this.target.emit("attach");
  },

  // Detach Proxy from Targetif no longer needed.
  // This is safe to call if controls already detached/invisible.
  detachProxyIfNotNeeded: function () {

    if ((!this.gripDown) &&
        (!this.triggerDown))
    {
      // Neither grip nor trigger down.
      // set our own record of visibility state.
      this.proxyVisible = false;

      // in debug mode we don't actually go invisible.
      if (!this.data.debug) {
        this.el.object3D.visible = false;
      }

      // Detach from the target object
      this.target.emit("detach");
    }
  },

  onTriggerDown: function (event) {
    // Trigger down puts us into rotation mode.
    this.triggerDown = true;

    this.attachProxy();

    // Store the rotation so we have a reference of where we rotated from.
    // Essential that we store this rotation *after* we have sync'd
    // rotation orientation with the target (done as part of the attach,
    // in the previous call)
    copyXYZ(this.controller.object3D.rotation, this.triggerDownCRotation);
    copyXYZ(this.el.object3D.rotation, this.triggerDownPRotation);
    logXYZ("Controller Rotation at Trigger Down: ", this.triggerDownCRotation, 1, true);
    logXYZ("Proxy Rotation at Trigger Down: ", this.triggerDownPRotation, 1, true);

    // For Quaternion calculations, we also want to compute & save some Quaternions.
    // using the same terminology as detailed in the tick function...
    // - A = Controller Rotation when Trigger Down
    // - B = Proxy Rotation when Trigger Down.
    // - C = Controller Rotation now.

    // So A is the Quaternion for this.triggerDownCRotation and
    // B is the Quaternion for this.triggerDownPRotation and
    this.eulerA.set(this.triggerDownCRotation.x,
                    this.triggerDownCRotation.y,
                    this.triggerDownCRotation.z);
    this.eulerB.set(this.triggerDownPRotation.x,
                    this.triggerDownPRotation.y,
                    this.triggerDownPRotation.z);
    this.quaternionA.setFromEuler(this.eulerA);
    this.quaternionB.setFromEuler(this.eulerB); // !! FIXED BUG
    this.quaternionAInverse = this.quaternionA.invert();
    this.quaternionAInverseB = this.quaternionAInverse;
    this.quaternionAInverseB.multiply(this.quaternionB);


  },

  onTriggerUp: function (event) {
    // Trigger down moves us out of rotation mode.
    this.triggerDown = false;

    // clear rotation lock.
    this.rotationLock = "";

    // We want to be aligned with the target shape, so we snap to a rotation
    // to match the target.
    // Note that Proxy may remain visible if Grip is still Down, so this is
    // worth doing.  Nicer for debug mode too...
    copyXYZ(this.target.object3D.rotation, this.el.object3D.rotation);

    // If proxy controls should now be invisible/detached, do it.
    this.detachProxyIfNotNeeded();
  },

  onGripDown: function (event) {
    this.gripDown = true;
    this.attachProxy();

    // Store this position, to use as a reference for future movements.
    copyXYZ(this.controller.object3D.position, this.gripDownPosition);

  },

  onGripUp: function (event) {
    this.gripDown = false;

    // This doesn't trigger any actual movement, that was already handled under
    // the "tick" method.

    // If controls should now be invisible/detached, do it.
    this.detachProxyIfNotNeeded();
  },

  attachEventListeners: function () {
    this.controller.addEventListener('triggerup', this.listeners.triggerup, false);
    this.controller.addEventListener('triggerdown', this.listeners.triggerdown, false);
    this.controller.addEventListener('gripup', this.listeners.gripup, false);
    this.controller.addEventListener('gripdown', this.listeners.gripdown, false);
  },

  tick: function (time, timeDelta) {

    const x = this.controller.object3D.position.x.toFixed(2);
    const y = this.controller.object3D.position.y.toFixed(2);
    const z = this.controller.object3D.position.z.toFixed(2);

    const xr = this.controller.object3D.rotation.x.toFixed(1);
    const yr = this.controller.object3D.rotation.y.toFixed(1);
    const zr = this.controller.object3D.rotation.z.toFixed(1);

    var logtext = "Proxy Controller Object\n"

    if (this.data.debug) {
      logtext += (this.useQuaternions) ? "Quaternions ON\n" : "Quaternions OFF\n";
//      logtext += logQuat("Rotation Offset Quaternion:\n", this.offsetQuaternion, 1);
//      logtext += logQuat("Inverse:\n", this.offsetInverseQuaternion, 1);
      logtext += logQuat("Quaternion A:\n", this.quaternionA, 1);
      logtext += logQuat("Quaternion B:\n", this.quaternionB, 1);
      logtext += logQuat("Quaternion A inverse:\n", this.quaternionAInverse, 1);
      logtext += logQuat("Quaternion A inverse B:\n", this.quaternionAInverseB, 1);

//      logtext += logXYZ("Euler equivalent:\n", this.offsetRotation, 1);
      logtext += logXYZ("Now Pos: ", this.controller.object3D.position, 2);
      logtext += logXYZ("Now Rot: ", this.controller.object3D.rotation, 2);
      logtext += `TriggerDown: ${this.triggerDown}\nGripDown: ${this.gripDown}\n`
      logtext += `RotationLock: ${this.rotationLock}\n`
      logtext += `Visible: ${this.proxyVisible}\n`
      logtext += logXYZ("Grip Down Position: ", this.gripDownPosition, 2);
      logtext += logXYZ("Trigger Down Rotation (Controller): ", this.triggerDownCRotation, 1);
      logtext += logXYZ("Trigger Down Rotation (Proxy): ", this.triggerDownPRotation, 1);
    }

    if ((this.gripDown) || (!this.triggerDown) || (!this.gripToMove)) {
      // target is allowed to change position.
      // (rotating when detached won't affect the target, and won't be
      // visible to the user.  But this can be useful in debug mode, so we move
      // even when detached).

      const xPosDelta = this.controller.object3D.position.x - this.gripDownPosition.x;
      const yPosDelta = this.controller.object3D.position.y - this.gripDownPosition.y;
      const zPosDelta = this.controller.object3D.position.z - this.gripDownPosition.z;

      // Apply the translation to this object.
      this.el.object3D.position.x += xPosDelta;
      this.el.object3D.position.y += yPosDelta;
      this.el.object3D.position.z += zPosDelta;

      // Now update our stored position to reflect that we have caught up.
      copyXYZ(this.controller.object3D.position, this.gripDownPosition);
    }

    if ((this.triggerDown) || (!this.gripDown) || (!this.triggerToRotate)) {
      // The Proxy is allowed to rotate
      // (rotating when detached won't affect the target, and won't be
      // visible to the user.  But this can be useful in debug mode, so we
      // rotate even when detached).

      // Compute the differences in rotation since the trigger was squeezed.
      // These are both data taken from the control, within a single frame of
      // reference, so we can safely deduct one from the other.
      // !! I think this is true... fingers crossed!
//      const rotDelta = new THREE.Euler(this.controller.object3D.rotation.x -
//                                       this.triggerDownCRotation.x,
//                                       this.controller.object3D.rotation.y -
//                                       this.triggerDownCRotation.y,
//                                       this.controller.object3D.rotation.z -
//                                       this.triggerDownCRotation.z);

      if (this.useQuaternions)
      {
        // Proper maths solution...

        // - A = Controller Rotation when Trigger Down
        // - B = Proxy Rotation when Trigger Down.
        // - C = Controller Rotation now.

        // We want to figure out D: What should Proxy Rotation now be?

        // D - B should equal C - A.  i.e. the two objects should have between
        // transformed in the same way.

        // Rotations are more like multiplication than addition, so best express
        // as D(B) = C(A) where (A) is the inverse of A etc.
        // therefore D = C(A)B

        // Which means that (A)B should be the rotation we apply to C to get D.

        // but we should do proper rotation composition, rather than
        // linear addition (which is prone to problems like Gimbal Lock).
        // This is done using Quaternions.

        // 2 possible approaches:
        // 1. Use deltas.  We just try to make a small adjustment to the
        // current state.
        // 2. Go right back to the Trigger Down event (A, B, C & D).

        // Approach 1 would require that we'd stored off the Controller position
        // at the last tick.
        // Then we do D = C(A)B for just the scope of the last tick, where
        // "B" and "A" are replaced by the data from the last tick.
        // We could do this using Quaternion.multiply.

        // Approach 2 would require the ability to overwrite the current rotation
        // data of the Proxy.  We could do this using Quaternion.copy.
        // Approach 2 is probably more performant, as we can pre-calculate A, (A)
        // and B.

        // So let's try Approach 2.
        // So D = C(A)B.
        // (A)B is pre-computed
        this.eulerC.set(this.controller.object3D.rotation.x,
                        this.controller.object3D.rotation.y,
                        this.controller.object3D.rotation.z);
        this.quaternionCRotNow.setFromEuler(this.eulerC)

        // Calculate C(A)B and copy into the object's quaternion.
        this.el.object3D.quaternion.copy(this.quaternionCRotNow.multiply(this.quaternionAInverseB));

        // Diags
        logQuat("Quat A", this.quaternionA, dp = 2, debug = true);
        logQuat("Quat A Inverse", this.quaternionAInverse, dp = 2, debug = true);
        logQuat("Quat B", this.quaternionB, dp = 2, debug = true);
        logQuat("Quat A Inverse B", this.quaternionAInverseB, dp = 2, debug = true);
        logQuat("Quat C", this.quaternionCRotNow, dp = 2, debug = true);
        logQuat("Quat D", this.el.object3D.quaternion, dp = 2, debug = true);

      }
      else {
        // Naive solution. (no quaternions)

        // Pretty simple...
        // - A = Controller Rotation when Trigger Down
        // - B = Proxy Rotation when Trigger Down.
        // - C = Controller Rotation now.

        // D = Proxy Rotation Now = B + C - A.
        logXYZ("Ctrlr TD Rot:", this.triggerDownCRotation, 1, true);
        logXYZ("Proxy TD Rot:", this.triggerDownPRotation, 1, true);
        logXYZ("Ctrlr Rot Now:", this.controller.object3D.rotation, 1, true);

        this.el.object3D.rotation.x = this.triggerDownPRotation.x +
              this.controller.object3D.rotation.x - this.triggerDownCRotation.x;
        this.el.object3D.rotation.y = this.triggerDownPRotation.y +
              this.controller.object3D.rotation.y - this.triggerDownCRotation.y;
        this.el.object3D.rotation.z = this.triggerDownPRotation.z +
              this.controller.object3D.rotation.z - this.triggerDownCRotation.z;

        logXYZ("Resulting Proxy Rotation:", this.el.object3D.rotation, 1, true);
      }
    }

    // Log diags info.
    if (this.data.debug) {
      var logPanel = document.querySelector(this.data.logger);
      logPanel.setAttribute('text', "value: " + logtext);
    }
  }
})

function copyXYZ(from, to) {
  to.x = from.x;
  to.y = from.y;
  to.z = from.z;
}

function logXYZ(text, pos, dp, debug = false) {

  var logtext = `${text} x: ${pos.x.toFixed(dp)}, y: ${pos.y.toFixed(dp)}, z: ${pos.z.toFixed(dp)}\n`
  if (debug) {
    console.log(logtext);
  }
  return (logtext);
}


function logQuat(text, quat, dp = 2, debug = false) {

  var logtext = `${text} w: ${quat.w.toFixed(dp)}, x: ${quat.x.toFixed(dp)}, y: ${quat.y.toFixed(dp)}, z: ${quat.z.toFixed(dp)}\n`

  if (debug) {
    var euler = new THREE.Euler(0,0,0)
    euler.setFromQuaternion(quat);
    logtext += `Equivalent Euler: x: ${euler.x.toFixed(dp)}, y: ${euler.y.toFixed(dp)}, z: ${euler.z.toFixed(dp)}\n`;
    console.log(logtext);
  }
  return (logtext);
}
