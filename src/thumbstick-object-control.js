//"use strict";

/* Controls to move & rotate blocks in 3D space using thumbsticks.
 *
 * One thumbstick (default: left) controls position
 * The other thumbstick (default: right) controls orientation (rotation).
 * Thumbstick movements is interpreted based on the orientation of the controller in question at that moment
 * (so e.g. if you hold the controller on it's side, then left = up, right = down).

 * As with 6dof-object-controller, control can be "direct" or via "events".
 * This allows for the applications of constrains (e.g. collisions) before
 * events are accepted.
 *
 * Currently this is intended for discrete controls, with a grid system for
 * positions, and a defined rotation increment.
 * Continuous movement would be possible, but would require an additional set
 * of readings from the thumbsticks, and probably some sort of acceleration
 * mechanism to allow rapid navigation.  That's not implemented at this time.
 */

AFRAME.registerComponent('thumbstick-object-control', {
/*
* logger: the ID of a text object to log debug info to.
* debug:  enables additional diags
* movestick: the ID of a controller object with a thumbstick to be used to
*          control movement.  Default: "#lhand".
* rotatestick: the ID of a controller object with a thumbstick to be used to
*          control rotation.  Default: "#rhand".
* posunit: the minimum unit of positional movement in m.  So 0.1 = 10cm.
* rotunit: the minimum unit of rotational movement in degrees.
* moverepeattime: number of msecs between repeated movements, when the movement
*          thumbstick is held in a "move" position.
* rotaterepeattime: number of msecs between repeated rotats, when the rotation
*          thumbstick is held in a "rotate" position.
* movement: one of: "direct", "events" or "both":
*          direct: the Target object is moved directly by this component.
*          events: the Target object emits events, which can be acted on by
*                  another component to effect movement.  This allows for
*                  interpolation of collision detection & other factors.
*          both: the Target object is moved directly, but events are also
*                 generated.
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
    logger:     {type: 'selector', default: "#log-panel"},
    debug:      {type: 'boolean', default: false},
    movestick:   {type: 'selector', default: "#lhand"},
    rotatestick: {type: 'selector', default: "#rhand"},
    posunit:     {type: 'number', default: 0.1},
    rotunit:     {type: 'number', default: 90},
    moverepeattime: {type: 'number', default: 250},
    rotaterepeattime: {type: 'number', default: 250},
    movement:    {type: 'string', default: "direct"}
  },

  init: function () {

    // This can be useful for debugging.
    // Leave commented out unless needed.
    // this.tick = AFRAME.utils.throttleTick(this.tick, 100, this);

    // State used in computations to reduce dynamic object creation.
    this.thumbstickVector = new THREE.Vector3();
    this.POAVector = new THREE.Vector3();
    this.axisOfRotation = new THREE.Vector3();
    this.sphericalAxis = new THREE.Spherical();
    this.moveVector = new THREE.Vector3();

    this.mappingQuaternion = new THREE.Quaternion();
    this.thumbstickQuaternion = new THREE.Quaternion();

    // Last position reported state.
    // This is used to determine what position & rotation events to pass
    // into the game engine.
    this.lastReportedPosition = new THREE.Vector3();
    this.lastReportedPosition.copy(this.el.object3D.position);

    this.lastReportedOrientation = new THREE.Quaternion();
    this.lastReportedOrientation.copy(this.el.object3D.quaternion);

    // other state.
    this.lastTickTime = 0;
    this.lastMoveTime = 0;
    this.lastMoveThumbstickEvent = null;
    this.lastRotateTime = 0;
    this.lastRotateThumbstickEvent = null;

    // debug info
    if (this.data.debug) {
      this.debug = {
        last : {
          rotationThumbstickVector : new THREE.Vector3(),
          rotationPOA : new THREE.Vector3(),
          rotationAxis : new THREE.Vector3(),
          rotationAxisSpherical : new THREE.Spherical(),
          rotationAngle : 0,
          rotationQuaternionWorld :  new THREE.Quaternion(),
          rotationQuaternionLocal :  new THREE.Quaternion(),
          moveThumbstickVector : new THREE.Vector3(),
          moveVectorLocal : new THREE.Vector3()
        },
        x : {
          rotationThumbstickVector : new THREE.Vector3(),
          rotationPOA : new THREE.Vector3(),
          rotationAxis : new THREE.Vector3(),
          rotationAxisSpherical : new THREE.Spherical(),
          rotationAngle : 0,
          rotationQuaternionWorld :  new THREE.Quaternion(),
          rotationQuaternionLocal :  new THREE.Quaternion(),
          moveThumbstickVector : new THREE.Vector3(),
          moveVectorLocal : new THREE.Vector3()

        },
        y : {
          rotationThumbstickVector : new THREE.Vector3(),
          rotationPOA : new THREE.Vector3(),
          rotationAxis : new THREE.Vector3(),
          rotationAxisSpherical : new THREE.Spherical(),
          rotationAngle : 0,
          rotationQuaternionWorld :  new THREE.Quaternion(),
          rotationQuaternionLocal :  new THREE.Quaternion(),
          moveThumbstickVector : new THREE.Vector3(),
          moveVectorLocal : new THREE.Vector3()
        }
      }
    }

    // Event listeners...  these are attached in update processing
    // (to allow for reconfiguration after initialization).
    this.listeners = {
      moveThumbstickMoved: this.moveThumbstickMoved.bind(this),
      rotateThumbstickMoved: this.rotateThumbstickMoved.bind(this)
    };
  },

  update: function () {
    // Store rotation unit in Radians, for use internally.
    this.rotationUnit = (Math.PI * this.data.rotunit) / 180;

    // Store flags to represent configured movement style.
    this.moveTarget = ((this.data.movement == "direct") ||
                       (this.data.movement == "both"));
    this.emitEvents = ((this.data.movement == "events") ||
                       (this.data.movement == "both"));

    this.moveController = this.data.movestick;
    this.rotateController = this.data.rotatestick;

    this.attachEventListeners();
  },

  attachEventListeners: function () {

    if (this.moveController) {
      this.moveController.addEventListener('thumbstickmoved',
                                           this.listeners.moveThumbstickMoved,
                                           false)
    }
    else
    {
      console.warn("No Move Controller configured")
    }

    if (this.rotateController) {
      this.rotateController.addEventListener('thumbstickmoved',
                                             this.listeners.rotateThumbstickMoved,
                                             false);
    }
    else
    {
      console.warn("No Rotate Controller configured")
    }
  },

  moveThumbstickMoved: function (event) {

    // We rate limit movements.  Note that due to inevitable variations in
    // exact position of the thumbstick, a single thumbstick move generates
    // a whole stream of thumbstickmoved events, and we don't want to act on
    // all of them.
    if ((this.lastMoveThumbstickEvent) &&
        (this.lastTickTime - this.lastMoveTime < this.data.moverepeattime)) {
      return;
    }

    // We need to:
    // 1. qualify the movement.  Is it large enough to trigger object movement?
    // 2. factoring in world orientation of controller, convert the 2D thumbstick
    //    vector to a vector in 3D space (in the world frame of reference)
    // 3. Translate that vector into a vector in the target's frame of
    //    reference.
    // 4. Translate that movement into a grid position movement for the target.
    //    which could be a movement in 1 or 2 directions (i.e. it could be a
    //    diagonal movement.

    // all these operate on this.thumbstickVector.
    var significant = this.getThumbstickVector(event)
    if (significant) {
      this.applyControllerOrientation(this.moveController, this.thumbstickVector);
      if (this.data.debug) {
        this.debug.last.moveThumbstickVector.copy(this.thumbstickVector);
      }

      this.convertToTargetFrameOfReference();
      if (this.data.debug) {
        this.debug.last.moveVectorLocal.copy(this.thumbstickVector);
      }

      // Finally aply the computed movement.
      this.vectorToGridMovements();

      // We now need to plan for the thumbstick being held in this position.
      // (in which case we want to move again after this.data.moverepeattime
      // msecs)
      // Set up some state to track this.
      this.lastMoveTime = this.lastTickTime;
      this.lastMoveThumbstickEvent = event;
    }
    else
    {
      // non-significant move means that the thumbstick has been recentered
      // i.e. movement stopped.
      this.lastMoveThumbstickEvent = null;
    }
  },

  // Returns false if the vector is too small to trigger movement.
  getThumbstickVector: function(event) {
    // In default controller orientation, the x/y movements of the thumbstick
    // are in fact in the x & z directions.
    this.thumbstickVector.set(event.detail.x, 0, event.detail.y);

    if (this.thumbstickVector.length() < 0.5) {
      // Movement too small to trigger a movement
      // (## consider making this threshold configurable)
      this.thumbstickVector.set(0, 0, 0);
      return(false);
    }

    return(true);
  },

  // This adjusts the thumbstick movement to reflect the current orientation
  // of the controller (using the world rotation of the controller).
  applyControllerOrientation: function (controller, vector) {

    controller.object3D.getWorldQuaternion(this.mappingQuaternion)
    vector.applyQuaternion(this.mappingQuaternion);
  },

  // This addresses the fact that the object may be within a frame of
  // reference that is rotated relative to the controller and/or world.
  convertToTargetFrameOfReference: function () {

    this.el.object3D.parent.getWorldQuaternion(this.mappingQuaternion)
    this.mappingQuaternion.invert();
    this.thumbstickVector.applyQuaternion(this.mappingQuaternion);
  },

  vectorToGridMovements: function () {
    // Assumes thumbstick vector is now in the frame of reference of the target.
    // It is significant (not close to zero), but not normalized.
    // However it may be insignificant in some X, Y & Z directions.
    // We move zero or one grid unit in each of X, Y & Z, depending on whether
    // the component in that direction is significant.
    this.moveVector.set(this.moveDistFromComponent(this.thumbstickVector.x),
                        this.moveDistFromComponent(this.thumbstickVector.y),
                        this.moveDistFromComponent(this.thumbstickVector.z));

    if (this.moveTarget) {
      this.el.object3D.position.add(this.moveVector);
    }

    if (this.emitEvents) {
      this.lastReportedPosition.add(this.moveVector);
      this.el.emit("move", this.lastReportedPosition);
    }
  },

  moveDistFromComponent: function(component) {

    var distance = 0;
    if (Math.abs(component) > 0.5) {
      distance = Math.sign(component) * this.data.posunit;

    }
    return(distance);
  },

  tick: function (time, timeDelta) {

    this.lastTickTime = time;

    if (this.data.debug)
    {
      // Project rotation that would arise from an X thumbstick movement.
      projectThumbstickMovement.call(this, this.debug.x, 1, 0);
      projectThumbstickMovement.call(this, this.debug.y, 0, 1);

      function projectThumbstickMovement(debug, x, y) {

        this.thumbstickVector.set(x, 0, y);
        this.applyControllerOrientation(this.rotateController, this.thumbstickVector);
        debug.rotationThumbstickVector.copy(this.thumbstickVector);

        this.axisOfRotation.set(0, 1, 0)
        this.applyControllerOrientation(this.rotateController, this.axisOfRotation);
        debug.rotationPOA.copy(this.axisOfRotation);

        this.axisOfRotation.cross(this.thumbstickVector)
        this.alignAxisOfRotation(this.axisOfRotation);
        debug.rotationAxis.copy(this.axisOfRotation);
        debug.rotationAxisSpherical.setFromVector3(this.axisOfRotation);
        debug.rotationAngle = this.rotationUnit;

        this.thumbstickQuaternion.setFromAxisAngle(this.axisOfRotation,
                                                   this.rotationUnit);

        debug.rotationQuaternionWorld.copy(this.thumbstickQuaternion);
        this.convertRotationToTargetFrameOfReference();

        debug.rotationQuaternionLocal.copy(this.thumbstickQuaternion);

        // And for movement...
        this.thumbstickVector.set(x, 0, y);
        this.applyControllerOrientation(this.moveController, this.thumbstickVector);
        debug.moveThumbstickVector.copy(this.thumbstickVector);
        this.convertToTargetFrameOfReference();
        debug.moveVectorLocal.copy(this.thumbstickVector);
      }

      // Now output all the data to screen.
      var logText = "Target\n"
      logText += THUMBSTICKlogQuat("Current Orientation", this.el.object3D.quaternion, 2, false);
      if ((this.el.object3D.quaternion.length() < 0.99) ||
          (this.el.object3D.quaternion.length() > 1.01))
       {
        console.error("Non-normalized quaternion for Target!  Length: " + this.el.object3D.quaternion.length());
        //alert("Non-normalized Target quaternion!");
      }
      logText += THUMBSTICKlogXYZ("Current Position", this.el.object3D.position, 2, false);
      logText += "\nLast Movement & Rotation\n"
      logText += dumpData.call(this, this.debug.last)
      logText += "\nX thumbstick now:\n"
      logText += dumpData.call(this, this.debug.x)
      logText += "\nY thumbstick now:\n"
      logText += dumpData.call(this, this.debug.y)

      this.data.logger.setAttribute('text', "value: " + logText);

      function dumpData(debug) {

        if ((debug.rotationQuaternionWorld.length() < 0.9999) ||
            (debug.rotationQuaternionWorld.length() > 1.0001)) {
          console.error("Non-normalized World quaternion!  Length: " + debug.rotationQuaternionWorld.length());
          //alert("Non-normalized World quaternion!");
        }
        if ((debug.rotationQuaternionLocal.length() < 0.9999) ||
            (debug.rotationQuaternionLocal.length() > 1.0001)) {
          console.error("Non-normalized Local quaternion!  Length: " + debug.rotationQuaternionLocal.length());
          //alert("Non-normalized Local quaternion!")
        }

        logText = THUMBSTICKlogXYZ("Rotate Thumbstick: ", debug.rotationThumbstickVector, 2, false);
        logText += THUMBSTICKlogXYZ("Rotation POA: ", debug.rotationPOA, 2, false);
        logText += "Thumbstick/POA angle:" + debug.rotationThumbstickVector.angleTo(debug.rotationPOA).toFixed(2) + "\n";
        logText += THUMBSTICKlogXYZ("Rotation Axis: ", debug.rotationAxis, 2, false);
        logText += THUMBSTICKlogSph("Rotation Axis Spherical: ", debug.rotationAxisSpherical, 2, false);
        logText += ("Rotation Angle: " + debug.rotationAngle.toFixed(2) + "\n");
        logText += THUMBSTICKlogQuat("Rotation World Q: ", debug.rotationQuaternionWorld, 2, false);
        logText += THUMBSTICKlogQuat("Rotation Local Q: ", debug.rotationQuaternionLocal, 2, false);

        logText += THUMBSTICKlogXYZ("Move Thumbstick: ", debug.moveThumbstickVector, 2, false);
        logText += THUMBSTICKlogXYZ("Move Local: ", debug.moveVectorLocal, 2, false);

        return(logText);
      }
    }

    /* In practice, doing anything on Tick is unecessary.
       seems to be impossible to hold a thumstick in position
       without generating a stream of thumbstickmoved events...
    if ((this.lastMoveThumbstickEvent) &&
        (time - this.lastMoveTime > this.data.moverepeattime))

    {
      // The thumbstick has been held in the movement position long enough for
      // us to repeat the movement.
      // Note this may not repeat the exact movement, as it's possible that
      // the controller itself has moved in this time, in which case the same
      // thumstick movement will be interpreted as a different target movement.
      this.moveThumbstickMoved(this.lastMoveThumbstickEvent)
    }

    if ((this.lastRotateThumbstickEvent) &&
        (time - this.lastRotateTime > this.data.rotaterepeattime))

    {
      // The thumbstick has been held in the movement position long enough for
      // us to repeat the movement.
      // Note this may not repeat the exact movement, as it's possible that
      // the controller itself has moved in this time, in which case the same
      // thumstick movement will be interpreted as a different target movement.
      this.rotateThumbstickMoved(this.lastRotateThumbstickEvent)
    } */
  },

  rotateThumbstickMoved: function (event) {

    // We rate limit movements.  Note that due to inevitable variations in
    // exact position of the thumbstick, a single thumbstick move generates
    // a whole stream of thumbstickmoved events, and we don't want to act on
    // all of them.
    if ((this.lastRotateThumbstickEvent) &&
        (this.lastTickTime - this.lastRotateTime < this.data.rotaterepeattime)) {
      return;
    }

    // We need to:
    // 1. qualify the movement.  Is it large enough to trigger object rotation?
    // 2. factoring in world orientation of controller, convert the 2D thumbstick
    //    vector to a vector in 3D space (in the world frame of reference)
    // 3. identify the "point of application" of that vector on a unit sphere
    //    centered on the controller.  This is needed to convert the vector into
    //    a rotation that will make sense to the user.
    // 4. Calculate the cross product of the thumbstick vector and the
    //    "point of application" vector to get an axis of rotation, and a
    //    direction.
    // 5. Snap this axis of rotation to the closest allowed axis of rotation,
    //    bearing in mind the need for rotations to be integer numbers of
    //    the configured rotation unit.
    // 6. Now compute a quaternion representation of this rotation.
    // 7. Finally, convert this world-quaternion into a locally meaningful
    //    quaternion that we can apply to the object.


    // 1. qualify the movement.  Is it large enough to trigger object rotation?
    var significant = this.getThumbstickVector(event)
    if (significant) {
      // 2. factoring in world orientation of controller, convert the 2D thumbstick
      //    vector to a vector in 3D space (in the world frame of reference)
      //    (this is identical to the movement case.)
      this.applyControllerOrientation(this.rotateController, this.thumbstickVector);

      if (this.data.debug) {
        this.debug.last.rotationThumbstickVector.copy(this.thumbstickVector);
      }

      // 3. identify the "point of application" of that vector on a unit sphere
      //    centered on the controller.  This is needed to convert the vector into
      //    a rotation that will make sense to the user.
      // 4. Calculate the cross product of the thumbstick vector and the
      //    "point of application" vector to get an axis of rotation, and a
      //    direction.
      // "Point of Application" in the default orientation is y = 1, x/z = 0.
      this.axisOfRotation.set(0, 1, 0)
      this.applyControllerOrientation(this.rotateController, this.axisOfRotation);
      if (this.data.debug) {
        this.debug.last.rotationPOA.copy(this.axisOfRotation);
      }
      this.axisOfRotation.cross(this.thumbstickVector)

      // 6. Snap this axis of rotation to the closest allowed axis of rotation,
      //    bearing in mind the need for rotations to be integer numbers of
      //    the configured rotation unit.
      this.alignAxisOfRotation(this.axisOfRotation);
      if (this.data.debug) {
        this.debug.last.rotationAxis.copy(this.axisOfRotation);
        this.debug.last.rotationAxisSpherical.setFromVector3(this.axisOfRotation);
        this.debug.last.rotationAngle = this.rotationUnit;
      }

      // 7. Now compute a quaternion representation of this rotation.
      this.thumbstickQuaternion.setFromAxisAngle(this.axisOfRotation,
                                                 this.rotationUnit);
      if (this.data.debug) {
        this.debug.last.rotationQuaternionWorld.copy(this.thumbstickQuaternion);
      }

      // 8. Finally, convert this world-quaternion into a locally meaningful
      //    quaternion that we can apply to the object.
      this.convertRotationToTargetFrameOfReference();
      if (this.data.debug) {
        this.debug.last.rotationQuaternionLocal.copy(this.thumbstickQuaternion);
      }

      // And apply this to the object...
      this.quaternionToTargetRotation();

      // We now need to plan for the thumbstick being held in this position.
      // (in which case we want to move again after this.data.moverepeattime
      // msecs)
      // Set up some state to track this.
      this.lastRotateTime = this.lastTickTime;
      this.lastRotateThumbstickEvent = event;
    }
    else
    {
      // non-significant move means that the thumbstick has been recentered
      // i.e. movement stopped.
      this.lastRotateThumbstickEvent = null;
    }
  },

/* Basic version for 90 degrees only.  Simple & works, but expect we'll retire
   this in favour of the more elegant & general spherical implementation below.

  alignAxisOfRotation: function(axisVector) {

    // select the dominant component of the axis (one of X, Y & Z)
    // and normalize.
    // For values of rotation unit below 90 degrees, it might be desirable
    // to have a more fine-grained solution, but 90 degree x/y/z axes is good
    // enough for now.

    xSize = Math.abs(axisVector.x);
    ySize = Math.abs(axisVector.y);
    zSize = Math.abs(axisVector.z);

    if ((xSize >= ySize) &&
        (xSize >= zSize)) {
      // X Dominant
      axisVector.x = Math.sign(axisVector.x);
      axisVector.y = 0;
      axisVector.z = 0;
    }
    else if ((ySize >= xSize) &&
             (ySize >= zSize)) {
      // Y Dominant
      axisVector.x = 0;
      axisVector.y = Math.sign(axisVector.y);
      axisVector.z = 0;
    }
    else {
      // Z dominant
      axisVector.x = 0;
      axisVector.y = 0;
      axisVector.z = Math.sign(axisVector.z);
    }
  },*/

  alignAxisOfRotation: function(axisVector) {

    // We need this axis to be in alignment with some integer
    // multiple of the configured rotation angle.
    //
    // We achieve this by converting to spherical co-ordinates, rounding the
    // two angle, and converting back, then normalizing.
    this.sphericalAxis.setFromVector3(axisVector);
    this.sphericalAxis.phi =
       Math.round(this.sphericalAxis.phi/this.rotationUnit) * this.rotationUnit;
    this.sphericalAxis.theta =
     Math.round(this.sphericalAxis.theta/this.rotationUnit) * this.rotationUnit;

    axisVector.setFromSpherical(this.sphericalAxis);
    axisVector.normalize();
  },

  convertRotationToTargetFrameOfReference: function() {
    // to apply the quaternion to the target correctly, we need
    // to convert the target to world space, apply the quaternion
    // and then convert back.
    this.el.object3D.getWorldQuaternion(this.mappingQuaternion)
    this.thumbstickQuaternion.multiply(this.mappingQuaternion);
    this.mappingQuaternion.invert();
    this.thumbstickQuaternion.premultiply(this.mappingQuaternion);

    // Normalizing the quaternion prevents tiny FP math errors from creeping
    // in over a series of rotations.
    this.thumbstickQuaternion.normalize();
  },

  quaternionToTargetRotation: function () {

    // this.thumbstickQuaternion represents a rotation to apply to the
    // existing orientation of the target.
    // Normalization helps avoid tiny errors creeping in over repeated
    // operations.

    if (this.moveTarget) {
      this.el.object3D.quaternion.multiply(this.thumbstickQuaternion);
      this.el.object3D.quaternion.normalize()
    }

    if (this.emitEvents) {
      // alongside the event, we want to report the final orientation of the
      // target, after applying the rotation.
      this.lastReportedOrientation.multiply(this.thumbstickQuaternion);
      this.lastReportedOrientation.normalize();
      this.el.emit("rotate", this.lastReportedOrientation);
    }
  }
});

// END OF thumbstick-object-control COMPONENT
//------------------------------------------------------------------------------

// Need to identify a better solution for these utility functions...
// For now, we make do with giving them (probably) unique names...

function THUMBSTICKlogXYZ(text, pos, dp, debug = false) {

  var logtext = `${text} x: ${pos.x.toFixed(dp)}, y: ${pos.y.toFixed(dp)}, z: ${pos.z.toFixed(dp)}\n`
  if (debug) {
    console.log(logtext);
  }
  return (logtext);
}

function THUMBSTICKlogSph(text, sph, dp, debug = false) {

  var logtext = `${text} rad: ${sph.radius.toFixed(dp)}, phi: ${sph.phi.toFixed(dp)}, theta: ${sph.theta.toFixed(dp)}\n`
  if (debug) {
    console.log(logtext);
  }
  return (logtext);
}

function THUMBSTICKlogQuat(text, quat, dp = 2, debug = false) {

  var logtext = `${text} length: ${quat.length().toFixed(dp)}, w: ${quat.w.toFixed(dp)}, x: ${quat.x.toFixed(dp)}, y: ${quat.y.toFixed(dp)}, z: ${quat.z.toFixed(dp)}\n`

  if (debug) {
    var euler = new THREE.Euler(0,0,0)
    euler.setFromQuaternion(quat);
    logtext += `Equivalent Euler: x: ${euler.x.toFixed(dp)}, y: ${euler.y.toFixed(dp)}, z: ${euler.z.toFixed(dp)}\n`;
    console.log(logtext);
  }
  return (logtext);
}
