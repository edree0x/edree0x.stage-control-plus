import QtQuick
import Quickshell
import Quickshell.Wayland
import "Model.js" as Model

// macOS hot corners for one display: push the pointer into a corner to run
// the action picked for it in settings. Only corners with an action get a
// surface, two pixels square, on top of everything; it takes the clicks on
// those pixels, so leave a corner empty if you click things there. How long
// the pointer must linger, and whether every display or only the outermost
// ones own their corners, come from settings.
Scope {
  id: corners

  required property var modelData       // the ShellScreen
  property var service: null

  readonly property var settings: service && service.settings ? service.settings : ({})
  readonly property var snap: service ? service.snap : null
  readonly property var monitor: snap && modelData ? Model.monitorByName(snap, modelData.name) : null
  readonly property var monitors: snap ? snap.monitors : []

  // How long the pointer must sit in the corner; 0 fires the moment it
  // arrives (expose's default), the stage's own 90ms brushes past safely.
  readonly property real cornerDelay: {
    var d = Number(settings.hotCornerDelay)
    return isNaN(d) ? 90 : Math.max(0, d)
  }
  readonly property bool outermostCorners: (settings.hotCornerDisplays || "all") === "outermost"

  // With "outermost", each corner lives only on the display at the physical
  // edge of the arrangement for that corner (expose's rule): the leftmost or
  // rightmost display, ties broken toward the top, then by name. Unknown
  // geometry shows every corner rather than none.
  function ownsCorner(atTop, atLeft) {
    if (!outermostCorners || !monitor || !monitors.length) return true
    var best = null
    for (var i = 0; i < monitors.length; i++) {
      var m = monitors[i]
      if (!m) continue
      if (!best) { best = m; continue }
      var edge = atLeft ? m.x : m.x + m.w
      var bestEdge = atLeft ? best.x : best.x + best.w
      var vertical = atTop ? m.y : m.y + m.h
      var bestVertical = atTop ? best.y : best.y + best.h
      var take
      if (edge !== bestEdge) take = atLeft ? edge < bestEdge : edge > bestEdge
      else if (vertical !== bestVertical) take = atTop ? vertical < bestVertical : vertical > bestVertical
      else take = String(m.name) < String(best.name)
      if (take) best = m
    }
    return !!best && best.name === monitor.name
  }

  component Corner: PanelWindow {
    id: corner

    property string action: "none"
    property bool atTop: true
    property bool atLeft: true
    // After firing, wait for the pointer to leave before firing again.
    property bool armed: true

    screen: corners.modelData
    visible: action !== "none" && !!corners.service && !corners.service.shown
      && corners.ownsCorner(corner.atTop, corner.atLeft)
    anchors {
      top: corner.atTop
      bottom: !corner.atTop
      left: corner.atLeft
      right: !corner.atLeft
    }
    implicitWidth: 2
    implicitHeight: 2
    color: "transparent"
    exclusionMode: ExclusionMode.Ignore
    WlrLayershell.layer: WlrLayer.Overlay
    WlrLayershell.namespace: "stage-control-plus-corner"
    WlrLayershell.keyboardFocus: WlrKeyboardFocus.None

    MouseArea {
      anchors.fill: parent
      hoverEnabled: true
      onEntered: if (corner.armed) dwell.restart()
      onExited: {
        dwell.stop()
        corner.armed = true
      }
    }

    Timer {
      id: dwell
      // Brushing past a corner shouldn't count.
      interval: corners.cornerDelay
      onTriggered: {
        corner.armed = false
        corners.service.runCornerAction(corner.action)
      }
    }
  }

  Corner { action: corners.settings.cornerTopLeft || "none"; atTop: true; atLeft: true }
  Corner { action: corners.settings.cornerTopRight || "none"; atTop: true; atLeft: false }
  Corner { action: corners.settings.cornerBottomLeft || "none"; atTop: false; atLeft: true }
  Corner { action: corners.settings.cornerBottomRight || "none"; atTop: false; atLeft: false }
}
