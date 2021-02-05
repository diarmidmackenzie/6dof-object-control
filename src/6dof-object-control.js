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
 * - sixdof-object-control is a component configured on the object to be
 *   controlled, the "Target".  It has to be configured with the ID of the
 *   proxy object.
 * - sixdof-control-proxy is a component configured on the entity representing
 *    the proxy object.  It has to be configured with the IDs of both the Target
 *    object & the Controller entity.
 *
 * For debug purposes in VR, both components output state to logger objects
 * that can be configured.
*/

/* This component is configured on the Target
 * with config indicating the proxy */
AFRAME.registerComponent('sixdof-object-control', {

/* proxy: the ID another object that is used as a proxy controller for this
*         target object.
* logger: the ID of a text object to log debug info to.
* debug:  enables additional diags.
* posunit: the minimum unit of positional movement in m.  So 0.1 = 10cm.
*          Should be positive & non-zero - e.g. 0.001 for smooth movement.
*          Note that small values can lead to very large numbers of movement
*          events (if enabled) - which could cause performance issues.
* posgrid: "relative" or "absolute".  Are the grid positions to snap to absolute
           or relative to the starting position?  Default is "absolute".
           (an equivalent setting for rotation is theoretically possible
           but not available at this time).
* rotunit: the minimum unit of rotational movement in degrees.
*          Should be positive & non-zero - e.g. 0.1 for smooth movement.
*          Note that small values can lead to very large numbers of movement
*          events (if enabled) - which could cause performance issues.
* movement: one of: "direct", "events" or "both":
*          direct: the Target object is moved directly by this component.
*          events: the Target object emits events, which can be acted on by
*                  another component to effect movement.  This allows for
*                  interpolation of collision detection & other factors.
*          both: the Target object is moved directly, but events are also
                 generated.
*          Note that "events" or "both" movement combined with small values for rotunit
*          or posunit leads to a very large number of generated events.
*
*          Events emitted are:
*          move: A positional update that includes x, y & z components.
*                 Event data includes details of the x, y & z components.
*                 This is an absolute new position, not a delta.
*          rotate: A rotational update that includes rotation in up to 3 axes.
*                 Event data includes both the Euler Angles & the Quaternion
*                 representation of the rotation.
*                 This is an absolute new rotation (from zero), not a delta.
*/
  schema: {
    proxy:      {type: 'string', default: "#proxy"},
    logger:     {type: 'string', default: "#log-panel"},
    debug:      {type: 'boolean', default: false},
    posunit:    {type: 'number', default: 0.1},
    posgrid:    {type: 'string', default: "absolute"},
    rotunit:    {type: 'number', default: 90},
    movement:    {type: 'string', default: "direct"}
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

    if (this.data.posgrid == "absolute") {
      this.gridReference = new THREE.Vector3(0, 0, 0)
    }
    else {
      this.gridReference = this.el.object3D.position.clone();
    }


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

    // Store flags to represent configured movement style.
    this.moveTarget = ((this.data.movement == "direct") ||
                       (this.data.movement == "both"));
    this.emitEvents = ((this.data.movement == "events") ||
                       (this.data.movement == "both"));

  },

  attachEventListeners: function () {
    this.el.addEventListener('attach', this.listeners.attach, false);
    this.el.addEventListener('detach', this.listeners.detach, false);
  },

  attachToProxy: function () {

    this.attached = true;
    console.log("PROXY ATTACHED----start taking position/rotation info from Proxy to Target");

    // calculating the offset to use when calculating target position from proxy position.
    // Note, we assume target & proxy ar ein the same frame of reference.
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
      // but snapped to a position grid, and rotations of fixed values
      // (e.g. 90 degrees, which is the default).
      // The offset is the (fixed) offset from the target to the proxy.
      //
      // The positions calculated here are absolute new posiitons, not deltas.
      const sx = this.targetPositionFromProxy(x, this.offset.x, this.gridReference.x);
      const sy = this.targetPositionFromProxy(y, this.offset.y, this.gridReference.y);
      const sz = this.targetPositionFromProxy(z, this.offset.z, this.gridReference.z);

      // Rotation elements are absolute positions (rotation from base state).
      const sxr = this.targetRotationFromProxy(xr);
      const syr = this.targetRotationFromProxy(yr);
      const szr = this.targetRotationFromProxy(zr);

      // Now apply the rotation (if we are in "direct" mode)
      if (this.moveTarget) {
        this.el.object3D.position.x = sx;
        this.el.object3D.position.y = sy;
        this.el.object3D.position.z = sz;

        this.el.object3D.rotation.x = sxr;
        this.el.object3D.rotation.y = syr;
        this.el.object3D.rotation.z = szr;
      }

      if (this.data.debug) {
        logtext += logXYZ("Target: ", this.el.object3D.position, 2);
        logtext += logXYZ("Target Rot: ", this.el.object3D.rotation, 1);

        var logPanel = document.querySelector(this.data.logger);
        logPanel.setAttribute('text', "value: " + logtext);
      }

      // Emit events for any changes to rotation or position.
      if (this.emitEvents) {

        var posChanged = this.reportChangesToPosition(sx, sy, sz);
        var rotChanged = this.reportChangesToRotation(sxr, syr, szr);
      }
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

    if ((x != this.lastReportedPosition.x) ||
        (y != this.lastReportedPosition.y) ||
        (z != this.lastReportedPosition.z))
     {
      // There has been some movement.
      changed = true;

     // event Data contains the new position.
      var eventData = new THREE.Vector3(x, y, z);
      this.el.emit("move", eventData);

      // Update record of the position we reported.
      copyXYZ(this.el.object3D.position, this.lastReportedPosition);
    }

    return(changed);
  },

  // Emit events for any changes to rotaton.  Return an indication whether
  // there were any events emitted.
  reportChangesToRotation: function (xr, yr, zr) {
    var changed = false;

    // We have some rotation.
    const xrDelta = xr - this.lastReportedRotation.x;
    const yrDelta = yr - this.lastReportedRotation.y;
    const zrDelta = zr - this.lastReportedRotation.z;

    if (xr !== this.lastReportedRotation.x ||
        yr !== this.lastReportedRotation.y ||
        zr !== this.lastReportedRotation.z) {

        // There has been some movement.
        var eventData = new THREE.Euler(xr, yr, zr);
        changed = true;
        this.el.emit("rotate", eventData);

        // Update record of the rotation we reported.
        copyXYZ(this.el.object3D.rotation, this.lastReportedRotation);
      }

    return(changed);
  },

  // Maps proxy position to target position by applying offset, and
  // snapping to units of positional movement.
  targetPositionFromProxy: function(position, offset, reference) {
    return((Math.round(
           (position - reference + offset)/this.data.posunit) *
           this.data.posunit) + reference);
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

// END OF sixdof-object-control COMPONENT
//------------------------------------------------------------------------------

/* This component is configured on the Proxy
 * with config indicating the Target and the Controller
 * Config available to configure for each of move & rotate,
 * whether it is controlled by Grip, Trigger, Either, or None.
 * None is a valid option, either because one of rotation or movement is not
 * needed.
 * In future, it could also be because that aspect of the target is Controlled
 * by the other hand, but we don't support multiple hand controls yet - that
 * would seem to require two proxies, one at each hand, both influencing the
 * target, and we have not designed for that.
*/

AFRAME.registerComponent('sixdof-control-proxy', {
  schema: {
    controller:  {type: 'string', default: "#rhand"},
    target:      {type: 'string', default: "#target"},
    logger:      {type: 'string', default: "#log-panel"},
    debug:       {type: 'boolean', default: false},
    move:        {type: 'string', default: "grip"},
    rotate:      {type: 'string', default: "trigger"}
  },

  init: function () {

    // This can be useful for debugging.
    // this.tick = AFRAME.utils.throttleTick(this.tick, 100, this);
    // Controls config----------------------------------------------------------

    // Translate controls config into a usable set of flags.
    switch (this.data.move) {
      case "grip":
        this.gripMove = true;
        this.triggerMove = false;
        break;

      case "trigger":
        this.triggerMove = true;
        this.gripMove = false;
        break;

      case "either":
        this.triggerMove = true;
        this.gripMove = true;
        break;

      case "none":
        this.triggerMove = false;
        this.gripMove = false;
        break;

      default:
        console.log("Unexpected move control config: " + this.data.move);
    }

    switch (this.data.rotate) {
      case "grip":
        this.gripRotate = true;
        this.triggerRotate = false;
        break;

      case "trigger":
        this.triggerRotate = true;
        this.gripRotate = false;
        break;

      case "either":
        this.triggerRotate = true;
        this.gripRotate = true;
        break;

      case "none":
        this.triggerRotate = false;
        this.gripRotate = false;
        break;

      default:
        console.log("Unexpected move control config: " + this.data.move);
    }

    console.log("Controls config:")
    console.log("gripRotate: " + this.gripRotate)
    console.log("gripMove: " + this.gripMove)
    console.log("triggerRotate: " + this.triggerRotate)
    console.log("triggerMove: " + this.triggerMove)

    // Controls state
    this.startRotateCRotation = {'x' : 0, 'y': 0, 'z': 0}; // controller
    this.startRotatePRotation = {'x' : 0, 'y': 0, 'z': 0}; // proxy
    this.rotateControlDown = false;
    this.startMovePosition = {'x' : 0, 'y': 0, 'z': 0};
    this.moveControlDown = false;
    this.gripDown = false;
    this.triggerDown = false;

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
    this.position = new THREE.Vector3(0,0,0);

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
  },

  // Safe to call this if the proxy is already attached/visible:
  // it won't jump control to a new place if the proxy is already visible.
  // (except in debug mode, where the proxy is always visible)
  attachProxy: function () {

    if (!this.proxyVisible) {
      // Set Proxy object position to current controller position.
      // We should not assume proxy & controller are in the same
      // frame of reference, so we get the controller's world position,
      // and convert it to the local position in the proxy's frame of
      // reference.
      this.controller.object3D.getWorldPosition(this.el.object3D.position);
      this.el.object3D.parent.worldToLocal(this.el.object3D.position);

      // We want to snap to the target's rotation.  TARGET -> PROXY.
      // We assume that the target & proxy *are* in the same frame of reference.
      // otherwise the proxy controller will be unusable.
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

    if ((!this.moveControlDown) &&
        (!this.rotateControlDown))
    {
      // Neither type of movement is underway..
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

    this.triggerDown = true;

    if (this.triggerRotate &&
      !(this.gripRotate && this.gripDown)) {
      this.startRotate();
    }
    if (this.triggerMove &&
      !(this.gripMove && this.gripDown)) {
      this.startMove();
    }
  },

  onTriggerUp: function (event) {

    this.triggerDown = false;

    if (this.triggerRotate &&
      !(this.gripRotate && this.gripDown)) {
      this.endRotate();
    }
    if (this.triggerMove &&
      !(this.gripMove && this.gripDown)) {
      this.endMove();
    }
  },

  onGripDown: function (event) {

    this.gripDown = true;

    if (this.gripRotate &&
      !(this.triggerRotate && this.triggerDown)) {
      this.startRotate();
    }
    if (this.gripMove &&
      !(this.triggerMove && this.triggerDown)) {
      this.startMove();
    }
  },
  onGripUp: function (event) {

    this.gripDown = false;

    if (this.gripRotate &&
      !(this.triggerRotate && this.triggerDown)) {
      this.endRotate();
    }
    if (this.gripMove &&
      !(this.triggerMove && this.triggerDown)) {
      this.endMove();
    }
  },

  startRotate: function () {
    // Signaled to enter rotation mode.
    this.rotateControlDown = true;

    this.attachProxy();

    // Store the rotation so we have a reference of where we rotated from.
    // Essential that we store this rotation *after* we have sync'd
    // rotation orientation with the target (done as part of the attach,
    // in the previous call)
    copyXYZ(this.controller.object3D.rotation, this.startRotateCRotation);
    copyXYZ(this.el.object3D.rotation, this.startRotatePRotation);
    logXYZ("Controller Rotation at Trigger Down: ", this.startRotateCRotation, 1, true);
    logXYZ("Proxy Rotation at Trigger Down: ", this.startRotatePRotation, 1, true);

    // For Quaternion calculations, we also want to compute & save some Quaternions.
    // using the same terminology as detailed in the tick function...
    // - A = Controller Rotation when Trigger Down
    // - B = Proxy Rotation when Trigger Down.
    // - C = Controller Rotation now.

    // So A is the Quaternion for this.startRotateCRotation and
    // B is the Quaternion for this.startRotatePRotation and
    this.eulerA.set(this.startRotateCRotation.x,
                    this.startRotateCRotation.y,
                    this.startRotateCRotation.z);
    this.eulerB.set(this.startRotatePRotation.x,
                    this.startRotatePRotation.y,
                    this.startRotatePRotation.z);
    this.quaternionA.setFromEuler(this.eulerA);
    this.quaternionB.setFromEuler(this.eulerB); // !! FIXED BUG
    this.quaternionAInverse = this.quaternionA.invert();
    this.quaternionAInverseB = this.quaternionAInverse;
    this.quaternionAInverseB.multiply(this.quaternionB);


  },

  endRotate: function () {
    // Trigger down moves us out of rotation mode.
    this.rotateControlDown = false;

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

  startMove: function (event) {
    this.moveControlDown = true;
    this.attachProxy();

    // Store this position, to use as a reference for future movements.
    copyXYZ(this.controller.object3D.position, this.startMovePosition);

  },

  endMove: function (event) {
    this.moveControlDown = false;

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
      logtext += logQuat("Quaternion A:\n", this.quaternionA, 1);
      logtext += logQuat("Quaternion B:\n", this.quaternionB, 1);
      logtext += logQuat("Quaternion A inverse:\n", this.quaternionAInverse, 1);
      logtext += logQuat("Quaternion A inverse B:\n", this.quaternionAInverseB, 1);

      logtext += logXYZ("Now Pos: ", this.controller.object3D.position, 2);
      logtext += logXYZ("Now Rot: ", this.controller.object3D.rotation, 2);
      logtext += `TriggerDown: ${this.triggerDown}\nGripDown: ${this.gripDown}\n`
      logtext += `MoveControlDown: ${this.moveControlDown}\nRotateControlDownGripDown: ${this.rotateControlDown}\n`
      logtext += `Visible: ${this.proxyVisible}\n`
      logtext += logXYZ("Move Start Position: ", this.startMovePosition, 2);
      logtext += logXYZ("Rotate Start Rotation (Controller): ", this.startRotateCRotation, 1);
      logtext += logXYZ("Rotate Start Rotation (Proxy): ", this.startRotatePRotation, 1);
    }

    if ((this.moveControlDown) || (!this.rotateControlDown)) {
      // target is allowed to change position.
      // (rotating when detached won't affect the target, and won't be
      // visible to the user.  But this can be useful in debug mode, so we move
      // even when detached).

      const xPosDelta = this.controller.object3D.position.x - this.startMovePosition.x;
      const yPosDelta = this.controller.object3D.position.y - this.startMovePosition.y;
      const zPosDelta = this.controller.object3D.position.z - this.startMovePosition.z;

      // Apply the translation to this object.
      // But we need to do so in controller-space, so we need to
      // transform from target-space, apply the translation & then transform back.

      this.el.object3D.getWorldPosition(this.position);
      this.controller.object3D.parent.worldToLocal(this.position);

      this.position.x += xPosDelta;
      this.position.y += yPosDelta;
      this.position.z += zPosDelta;

      this.controller.object3D.parent.localToWorld(this.position);
      this.el.object3D.parent.worldToLocal(this.position);
      this.el.object3D.position.copy(this.position);

      // Now update our stored position to reflect that we have caught up.
      copyXYZ(this.controller.object3D.position, this.startMovePosition);
    }

    if ((this.rotateControlDown) || (!this.moveControlDown)) {
      // The Proxy is allowed to rotate
      // (rotating when detached won't affect the target, and won't be
      // visible to the user.  But this can be useful in debug mode, so we
      // rotate even when detached).

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
      /* These proved too verbose - commenting out.
      logQuat("Quat A", this.quaternionA, dp = 2, debug = true);
      logQuat("Quat A Inverse", this.quaternionAInverse, dp = 2, debug = true);
      logQuat("Quat B", this.quaternionB, dp = 2, debug = true);
      logQuat("Quat A Inverse B", this.quaternionAInverseB, dp = 2, debug = true);
      logQuat("Quat C", this.quaternionCRotNow, dp = 2, debug = true);
      logQuat("Quat D", this.el.object3D.quaternion, dp = 2, debug = true);
      */
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
