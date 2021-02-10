

AFRAME.registerComponent('keyboard-hand-controls', {
    schema: {
       posstep: {type: 'number', default: 0.01},
       rotstep: {type: 'number', default: 0.01},
       logger: {type: 'string', default: '#log-panel'}
     },

     init: function () {

       this.selectedControlIndex = 0;
       this.controlsTable = ["x", "y", "z", "Rx", "Ry", "Rz", "Grip", "Trigger", "A", "random", "TSx", "TSy"];
       this.gripDown = false;
       this.triggerDown = false;
       this.ADown = false;
       this.randomMovement = 0;
       this.worldPosition = new THREE.Vector3();
       this.listeners = {
         //plus: this.plus.bind(this),
         //minus: this.minus.bind(this),
         //select: this.select.bind(this),
         keydown: this.keydown.bind(this),
         disable: this.disable.bind(this),
         enable: this.enable.bind(this),
       };
       this.disabled = false;
     },

     update: function () {
       this.posStep = this.data.posstep;
       this.rotStep = this.data.rotstep;
       this.logPanel = document.querySelector(this.data.logger);
     },

     play: function () {
       this.attachEventListeners();
     },

     pause: function () {
       this.removeEventListeners();
     },

     remove: function () {
       this.pause();
     },

     enable: function () {
       this.disabled = false;
     },

     disable: function () {
       this.disabled = true;
     },

     attachEventListeners: function () {
       //this.el.addEventListener('plus', this.listeners.plus, false);
       //this.el.addEventListener('minus', this.listeners.minus, false);
       //this.el.addEventListener('select', this.listeners.select, false);
       window.addEventListener('keydown', this.listeners.keydown, false);
       this.el.addEventListener('enable', this.listeners.enable, false);
       this.el.addEventListener('disable', this.listeners.disable, false);
     },

     removeEventListeners: function () {
       //this.el.removeEventListener('plus', this.listeners.select);
       //this.el.removeEventListener('minus', this.listeners.select);
       //this.el.removeEventListener('select', this.listeners.select);
       window.removeEventListener('keydown', this.listeners.keydown);
       this.el.removeEventListener('enable', this.listeners.enable);
       this.el.removeEventListener('disable', this.listeners.disable);
     },

     plus: function (event) {

       if (!this.disabled) {
         console.log("Plus event");
         this.applyMovement(this.controlsTable[this.selectedControlIndex], 1);
       }

     },
     minus: function (event) {
       if (!this.disabled) {
         console.log("Minus event");
         this.applyMovement(this.controlsTable[this.selectedControlIndex], -1);
       }
     },
     keydown: function (event) {
       if (!this.disabled) {
         switch (event.key) {
           case "-":
             this.minus(event);
             break;

           case "=":
             this.plus(event);
             break;

           case "1":
           case "2":
           case "3":
           case "4":
           case "5":
           case "6":
           case "7":
           case "8":
           case "9":
               this.selectedControlIndex = (event.key.charCodeAt(0) - "1".charCodeAt(0));
               break;

           case "0":
              this.selectedControlIndex = 9;
              break;

           case "c":
           case "C":
              this.selectedControlIndex = 10;
              break;

           case "v":
           case "V":
              this.selectedControlIndex = 11;
              break;
         }
       }
     },

     select: function (event) {

       this.selectedControlIndex +=1;

       if (this.selectedControlIndex >= this.controlsTable.length) {
         this.selectedControlIndex = 0;
       }

       console.log("Selected control: " +
                   this.controlsTable[this.selectedControlIndex]);
     },

     applyMovement: function (control, dir) {

       switch(control) {

         case "x":
           this.el.object3D.position.x += this.posStep * dir;
           break;

         case "y":
           this.el.object3D.position.y += this.posStep * dir;
           break;

         case "z":
           this.el.object3D.position.z += this.posStep * dir;
           break;

         case "Rx":
           this.el.object3D.rotation.x += this.rotStep * dir;
           break;

         case "Ry":
           this.el.object3D.rotation.y += this.rotStep * dir;
           break;

         case "Rz":
           this.el.object3D.rotation.z += this.rotStep * dir;
           break;

         case "Grip":
           if (!this.gripDown) {
             this.el.emit("gripdown");
             this.gripDown = true;
           }
           else { //this.gripDown
             this.el.emit("gripup");
             this.gripDown = false;
           }
           break;

         case "Trigger":
           if (!this.triggerDown) {
             this.el.emit("triggerdown");
             this.triggerDown = true;
           }
           else { //this.triggerDown
             this.el.emit("triggerup");
             this.triggerDown = false;
           }
           break;

         case "A":
           if (!this.ADown) {
             this.el.emit("abuttondown");
             this.ADown = true;
           }
           else { //this.ADown = false.
             this.el.emit("abuttondownup");
             this.ADown = false;
           }
           break;

         case "random":
           this.randomMovement += dir;
           break;

         case "TSx":
           this.el.emit("thumbstickmoved",
           // simulate slightly noisy movement
                        {x: dir * 0.8, y: 0.1});
           // thumbstick recentered after move
           // else it will seem to be held down.
           this.el.emit("thumbstickmoved",
                         {x: 0, y: 0});
           break;

         case "TSy":
           this.el.emit("thumbstickmoved",
                        {x: 0.1, y: 0.8 * dir});
           // thumbstick recentered after move
           // else it will seem to be held down.
           this.el.emit("thumbstickmoved",
                        {x: 0, y: 0});
           break;

         default:
           console.log("Unexpected value for control");
           break;
       }
     },

     tick: function() {

       const x = this.el.object3D.position.x;
       const y = this.el.object3D.position.y;
       const z = this.el.object3D.position.z;

       this.el.object3D.getWorldPosition(this.worldPosition);
       const xw = this.worldPosition.x;
       const yw = this.worldPosition.y;
       const zw = this.worldPosition.z;

       const xr = this.el.object3D.rotation.x;
       const yr = this.el.object3D.rotation.y;
       const zr = this.el.object3D.rotation.z;

       // Move/rotate all at once.
       if (this.randomMovement !== 0) {
         this.el.object3D.position.x += ((Math.random() - 0.5) * this.randomMovement * this.posStep);
         this.el.object3D.position.y += ((Math.random() - 0.5) * this.randomMovement * this.posStep);
         this.el.object3D.position.z += ((Math.random() - 0.5) * this.randomMovement * this.posStep);

         this.el.object3D.rotation.x += ((Math.random() - 0.5) * this.randomMovement * 10 * this.rotStep);
         this.el.object3D.rotation.y += ((Math.random() - 0.5) * this.randomMovement * 10 * this.rotStep);
         this.el.object3D.rotation.z += ((Math.random() - 0.5) * this.randomMovement * 10 * this.rotStep);

         // Plus (rarely) further random movements that may trigger grip, trigger etc.
         if (Math.random() > 0.99) {
           this.applyMovement(this.controlsTable[6 + Math.floor(Math.random() * 2)], 1);
         }

         // Also some random thumbstick movements.
         if (Math.random() > 0.9) {
           this.el.emit("thumbstickmoved",
                        {x: (Math.random() * 2) - 1, y: (Math.random() * 2) - 1});
           // thumbstick recentered after move
           // else it will seem to be held down.
           this.el.emit("thumbstickmoved",
                        {x: 0, y: 0});
         }
       }

       var logtext = "Keyboard Virtual Controller - "
       if (this.disabled) {
         logtext += "DISABLED\n"
       }
       else {
         logtext += "ACTIVE\n"
       }
       logtext += `Position: x: ${x.toFixed(2)}, y: ${y.toFixed(2)}, z: ${z.toFixed(2)}\n`
       logtext += `World Position: x: ${xw.toFixed(2)}, y: ${yw.toFixed(2)}, z: ${zw.toFixed(2)}\n`
       logtext += `Rotation: xr: ${xr.toFixed(1)}, yr: ${yr.toFixed(1)}, zr: ${zr.toFixed(1)}\n`
       logtext += `Grip Down: ${this.gripDown}\nTrigger Down: ${this.triggerDown}\n`
       logtext += `A Down: ${this.ADown}\n`
       logtext += `Random Movement: ${this.randomMovement}\n`
       logtext += `Selected Control: ${this.controlsTable[this.selectedControlIndex]}\n`
       // select using keys starting from 3.
       var controls = this.controlsTable.map((value, index) => ((index + 1) + ":" + value)).join(", ");
       logtext += `Keys: select one of: ${controls.substring(0, 20)}\n${controls.substring(21,55)}\n`
       logtext += "C and V for ThumbstickX & ThumbstickY "
       logtext += "then - and = to move/pull triggers."

       this.logPanel.setAttribute('text', "value: " + logtext);
     }
  });
