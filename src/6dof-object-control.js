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
    // Note, we assume target & proxy are in the same frame of reference.
    // This is a *fixed* offset.
    // In "direct" mode this is straightforward.  The offset enables us to map to
    // the exact position of the target.
    // In "events" mode, it's more subtle.  The offset enables us to map to a virtual
    // position of the target.  We can use relative changes in this virtual position to
    // tell us what events to pass to the object itself.  But these virtual positions
    // may drift a long way from the true object position, due to e.g.
    // - the object moving in space for other reasons.
    // - move suggestions from this component not being implemented, due to collisions,
    //   play area boundaries etc.
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
        logtext += logQuat("Proxy Quat: ", this.proxy.object3D.quaternion, 1);
        logtext += logQuat("Target Quat: ", this.el.object3D.quaternion, 1);
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
      // The offset is the offset from the target to the proxy (which may vary, if
      // the controlled target is not moved in response to a "move" event)
      //
      // The positions calculated here are absolute new positions, not deltas.
      // However in "events" mode the true object position might be quite different
      // from this calculated position, as per comments above (see offset initialization).
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
      logtext += logXYZ("Target: ", this.el.object3D.position, 2);
      logtext += logQuat("Proxy Quat: ", this.proxy.object3D.quaternion, 1);
      logtext += logQuat("Target Quat: ", this.el.object3D.quaternion, 1);

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

      // Together with our "move" event, we need to provide a new location.
      // But we can't use x, y, z as the actual object position, as in "events"
      // mode the object is not under our full control and its position may be
      // affected by other factors.

      // So we take the difference between x, y, z and lastReportedPosition,
      // and apply this as a delta to the true current position.

      // We don't try to track the true current position - we just use it
      // instantaneously at this point to allow us to provide a "new position"
      // that is correct relative to the object's position right now.

      var eventData = new THREE.Vector3(x, y, z);

      eventData.x -= this.lastReportedPosition.x;
      eventData.y -= this.lastReportedPosition.y;
      eventData.z -= this.lastReportedPosition.z;
      eventData.add(this.el.object3D.position);

      this.el.emit("move", eventData);

      // Update record of the position we reported, and update our offset to
      // reflect the drift.
      this.lastReportedPosition.x = x;
      this.lastReportedPosition.y = y;
      this.lastReportedPosition.z = z;
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
        var euler = new THREE.Euler(xr, yr, zr);
        var eventData = new THREE.Quaternion();
        eventData.setFromEuler(euler);
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
    rotate:      {type: 'string', default: "trigger"},
    disabled:    {type: 'boolean', default: false}
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

    // Controls state / workings.
    this.controllerWorldRotationNow = new THREE.Quaternion(); // controllerNow
    this.startRotateControllerWorldRotation = new THREE.Quaternion(); // controller
    this.startRotateProxyLocalRotation = new THREE.Quaternion(); // proxy
    this.startRotateProxyWorldRotation = new THREE.Quaternion(); // proxy
    this.proxyRotationMovementTransform = new THREE.Quaternion();
    this.proxyRotationWorldTransform = new THREE.Quaternion();

    this.rotateControlDown = false;
    this.startMovePosition = {'x' : 0, 'y': 0, 'z': 0};
    this.moveControlDown = false;
    this.gripDown = false;
    this.triggerDown = false;
    this.disabled = this.data.disabled;

    // Position & Quaternion used for working, to avoid creation & deletion within the
    // tick cycle.
    this.position = new THREE.Vector3(0,0,0);
    this.quat = new THREE.Quaternion();
    this.quatDebug = new THREE.Quaternion();


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
      gripup: this.onGripUp.bind(this),
      enabled: this.onEnabled.bind(this),
      disabled: this.onDisabled.bind(this)
    };
    this.attachEventListeners();

  },

  update: function () {

    this.disabled = this.data.disabled;
    this.controller = document.querySelector(this.data.controller)
    this.target = document.querySelector(this.data.target)
  },

  onEnabled: function () {
    if (this.data.debug) {
      console.log("6DoF Proxy Controls Enabled")
    }
    this.disabled = false;

    // If Grip is already down, or Trigger is already down, handle as if they
    // were just pressed.
    if (this.gripDown) {
      this.onGripDown()
    }

    if (this.triggerDown) {
      this.onTriggerDown()
    }
  },

  onDisabled: function () {
    if (this.data.debug) {
      console.log("6DoF Proxy Controls Disabled")
    }

    // If Grip or Trigger are down, act as if they were released.
    // but keep track of the fact that they are down, so that we can
    // put things back as they were if we are enabled again before they are
    // released.
    if (this.gripDown) {
      this.onGripUp()
      this.gripDown = true;
    }

    if (this.triggerDown) {
      this.onTriggerUp()
      this.tiggerDown = true;
    }

    this.disabled = true;
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
      // reference (i.e. that of it's parent, if it has one).
      this.controller.object3D.getWorldPosition(this.el.object3D.position);
      if (this.el.object3D.parent) {
        this.el.object3D.parent.worldToLocal(this.el.object3D.position);
      }

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

  // Detach Proxy from Target if no longer needed.
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

  onTriggerDown: function () {

    this.triggerDown = true;

    if (!this.disabled) {

      if (this.triggerRotate &&
        !(this.gripRotate && this.gripDown)) {
        this.startRotate();
      }
      if (this.triggerMove &&
        !(this.gripMove && this.gripDown)) {
        this.startMove();
      }
    }
  },

  onTriggerUp: function () {

    this.triggerDown = false;

    if (!this.disabled) {

      if (this.triggerRotate &&
        !(this.gripRotate && this.gripDown)) {
        this.endRotate();
      }
      if (this.triggerMove &&
        !(this.gripMove && this.gripDown)) {
        this.endMove();
      }
    }
  },

  onGripDown: function () {

    this.gripDown = true;

    if (!this.disabled) {

      if (this.gripRotate &&
        !(this.triggerRotate && this.triggerDown)) {
        this.startRotate();
      }
      if (this.gripMove &&
        !(this.triggerMove && this.triggerDown)) {
        this.startMove();
      }
    }
  },
  onGripUp: function () {

    this.gripDown = false;

    if (!this.disabled) {

      if (this.gripRotate &&
        !(this.triggerRotate && this.triggerDown)) {
        this.endRotate();
      }
      if (this.gripMove &&
        !(this.triggerMove && this.triggerDown)) {
        this.endMove();
      }
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
    this.controller.object3D.getWorldQuaternion(this.startRotateControllerWorldRotation);
    this.el.object3D.getWorldQuaternion(this.startRotateProxyWorldRotation);
    this.startRotateProxyLocalRotation.copy(this.el.object3D.quaternion);
    logQuat("Controller World Rotation at Trigger Down: ", this.startRotateControllerWorldRotation, 1, true);
    logQuat("Proxy Local Rotation at Trigger Down: ", this.startRotateProxyLocalRotation, 1, true);

    // We also compute a Quaternion which can be used to transform
    // the controller's current world location into a desired local rotation for
    // the proxy.
    // See long comment in tick rotation processing for an explanation of this.

    // A and B are rotations of the controller & proxy at Rotation Start
    // Post = (A)B
    this.proxyRotationMovementTransform.copy(this.startRotateControllerWorldRotation);
    this.proxyRotationMovementTransform.invert();
    this.proxyRotationMovementTransform.multiply(this.startRotateProxyWorldRotation);

    // E and B are the local & world rotations of the proxy at Rotation Start
    // Pre = E(B)
    this.proxyRotationWorldTransform.copy(this.startRotateProxyWorldRotation);
    this.proxyRotationWorldTransform.invert();
    this.proxyRotationWorldTransform.premultiply(this.startRotateProxyLocalRotation);
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
    this.el.object3D.quaternion.copy(this.target.object3D.quaternion)

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
    this.el.addEventListener('controls-enabled', this.listeners.enabled, false);
    this.el.addEventListener('controls-disabled', this.listeners.disabled, false);
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
      logtext += logQuat("Rot Start Controller World Quaternion:\n", this.startRotateControllerWorldRotation, 1);
      logtext += logQuat("Rot Start Proxy Local Quaternion:\n", this.startRotateProxyLocalRotation , 1);
      logtext += logQuat("Rot Start Proxy World Quaternion:\n", this.startRotateProxyWorldRotation , 1);
      logtext += logQuat("Proxy Rotation Pre Transform Quaternion:\n", this.proxyRotationMovementTransform, 1);
      logtext += logQuat("Proxy Rotation Post Transform Quaternion:\n", this.proxyRotationWorldTransform, 1);

      logtext += logXYZ("Now Pos: ", this.controller.object3D.position, 2);
      logtext += logXYZ("Now Rot: ", this.controller.object3D.rotation, 2);
      logtext += `TriggerDown: ${this.triggerDown}\nGripDown: ${this.gripDown}\n`
      logtext += `MoveControlDown: ${this.moveControlDown}\nRotateControlDownGripDown: ${this.rotateControlDown}\n`
      logtext += `Visible: ${this.proxyVisible}\n`
      logtext += logXYZ("Move Start Position: ", this.startMovePosition, 2);
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

      // What rotation to apply?
      // Controller and Proxy may be in different frames of reference.
      // What will make sense to the user is if the world rotation of the
      // proxy mirrors the world rotation of the controller.

      // We can readily access:
      // - The world rotation of the controller at Rotation Start (A)
      // - The world rotation of the controller now (C)
      // - The local & world rotations of the proxy at Rotation Start (E and B)

      // We need to set the local rotation of the proxy that we want now.
      //
      // We *assume* that the relationship between local & world rotations
      // of the proxy has not changed since Rotation Start.
      // (I can't see how to easily avoid this assumption).
      // This means that if the proxy/target are moving (e.g. they are on a
      // rotating carousel, this may not work, but it should be ok in other cases).

      // Here's the calculations...
      // To calculate L, the local rotation to apply to the proxy, we need to
      // calculate:
      // 1. The World rotation of the proxy that we want:
      // 2. A transform T that will take us from world rotation to local rotation.
      // Then L = TR

      // What's R?
      // R = C(A)B - where (A) is the inverse of A.
      // We take the initial world rotation of the proxy, B.
      // And we apply a transform consisting of the delta on the world rotaton
      // of the controller, i.e. C(A).

      // What about T?
      // we know that E = TB, since B is the world rotation equivalent of E.
      // so T = E(B)

      // So L = TR = E(B)C(A)B

      // E(B) and (A)B can both be pre-calculated at the point we start rotation.
      // E(B) represents the transform from world to local.
      // (A)B represents the transform due to controller movement.

      // Note that if C = A (no move since rotation trigger) then...
      //... E(B)C(A)B = E = the local rotation of the proxy at rotation start
      // (i.e. no movement) - which is absolutely correct.

      //Get C
      this.controller.object3D.getWorldQuaternion(this.controllerWorldRotationNow);

      // Calculate CA(B)
      this.quat.multiplyQuaternions(this.controllerWorldRotationNow,
                                    this.proxyRotationMovementTransform);

      // if there has been no movement, this should just be (B), i.e.
      // the inverse of this.startRotateProxyWorldRotation.
      // Can't assert though, as may not be exactly equal due to FP errors.

      // Now calculate E(B)C(A)B
      this.quat.premultiply(this.proxyRotationWorldTransform);

      // Overwrite the proxy's Quaternion with the computed value.
      this.el.object3D.quaternion.copy(this.quat);
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
