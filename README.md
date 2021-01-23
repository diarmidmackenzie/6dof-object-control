# 6dof-object-control
 Control objects with 6DoF controllers



### Overview

This is an A-Frame component that offers control of an object in the player's space using a 6DOF controller.

Optionally the object can be constrained to rotation and movement in fixed units (e.g. 10cm and 90 degrees).

This was developed for use in a 3D Tetris game.  However I hope it will be useful in other applications as well.



### User Controls

The control system makes the 6DOF controller operate like a kind of 3D mouse, being used to click & drag the target object.

The user controls movement of the object using the 6DOF controller as follows:

- Hold grip down and move to move the object.
- Hold trigger down and rotate the controller to rotate the object.
- Holding grip + trigger at the same time allows simultaneous rotation and movement.

When neither the grip and trigger is pressed, the controller can be moved around without any impact on the target object.



### Installation

Download key-bindings.js from this repo, and include like this:

```
<script src="6dof-object-control.js"></script>
```

CDN through JSDeliver coming soon...



### How It Works

An implementation of this control system requires at least 3 entities, named as follows:

- Target: the object under control
- Proxy: an object that appears at the location of the player's controller, in an orientation that matches the Target.
- Controller: the entity representing the player's controller.

The Proxy object is particularly useful when rotation and movement are constrained to fixed increments, because it allows the player to see partial movements they are making, even when they don't amount to any movement of the Target.

If you don't want the Proxy in your user's experience, you can set the element to be invisible.



### Basic Usage 

See Examples for some basic usage.

There are 2 separate components that make up the controls:

- sixdof-object-control - configured on the Target (the object you want to control).
- sixdof-control-proxy - configured on the Proxy (see above)

To get things working at all, you'll need to set the following (or configure your objects with the default values):

- sixdof-object-control
  -  proxy: the element ID of the Proxy.  Default: #target-proxy

*         sixdof-control-proxy
          * controller: the element ID of the Controller.  Default: #rhand
          * target: the element ID of the Target.  Default: #target

Setting these correctly should be enough to get basic control of the object.  You can then fine-tune things with the following options.



### Options

Further config options are available as follows.

#### sixdof-object-control

-  proxy: the element ID of the Proxy.  Default: #target-proxy

* posunit: the minimum unit of positional movement in m.  So 0.1 = 10cm.  Should be non-zero (and positive unless you want the controls to work backwards!) - so e.g. use 0.001 for smooth movement (not 0).  Note that small values can lead to very large numbers of movement events (if enabled) - which could lead to performance issues.
* rotunit: the minimum unit of rotational movement in degrees.  Should be non-zero (and positive unless you want the controls to work backwards!).. For smooth movement use a small value, e.g. 0.1.  Note that small values can lead to very large numbers of movement events (if enabled) - which could lead to performance issues.
* movement: one of "direct", "events" or "both".  Default: direct.
  * direct: the Target object is moved directly by this component.  This is the simplest option.

  * events: the Target object emits events, which can be acted on by another component to effect movement.  This allows for interpolation of collision detection & other factors.  But it means that the logic to actually move the object needs to be implemented elsewhere.

  *          both: the Target object is moved directly, but events are also generated.
             
             Note that "events" or "both" movement combined with small values for rotunit or posunit leads to a very large number of generated events, which could lead to peformance issues.
             
             

#### sixdof-control-proxy

- No config at this time.  It would be desirable to be able to configure the roles of the grip & trigger buttons, but that's not yet implemented.

  

### Debugging

The following debug capabilities have mostly been implemented for debugging problems with these components, but may also be useful for debugging applications that use these components.

- debug: Set "debug:true" on either component to enable detailed console logging, and real-time data output to a logger element.
- logger: Set to the ID of an <a-text> element to out real-time positional data.  Default value is #log-panel.

Set logger to different elements for the two different components, or they will overwrite each other.



### keyboard-hand-controls

Debugging in VR can be difficult, as VR browsers don't have the same level of diagnostics that are available in desktop browsers (Inspect panel, console logs, etc.)

This repo also includes a component that can be used to simulate the movements of a 6DOF controller, using keyboard in the browser.

Configure this component on the Controller entity, e.g.

      <a-entity id="rhand"
                hand-controls="hand: right"
                keyboard-hand-controls="logger:#log-panel3">
Controls as follows:

- Number keys 1-8 to pick a control to move: 1-3  are movement axes, 4-6 are rotation axes, 7 is Grip, 8 is Trigger.
- minus (-) and equals (=) keys to move the selected control by a small amount (or toggle the grip or trigger)

Config options for keyboard-hand-controls as follows:

- posstep: The distance moved for each key press.  Default: 0.01 (1cm)
- rotstep: The rotation for each key press.  Default: 0.01 (0.01 Radians, approx 1.7 degrees)
- logger: The element ID of am <a-text> element to log to.  Default: #log-panel.  Set this to a value different from loggers used by other components, or they will overwrite each other.

