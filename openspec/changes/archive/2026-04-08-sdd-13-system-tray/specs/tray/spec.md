# Tray Specification

## Purpose

Defines the behavior and lifecycle of the system tray icon, including application startup, menu actions, and teardown for the `autoreas-bridge` application on Windows.

## Requirements

### Requirement: Tray Initialization on Startup

The system MUST initialize and display a system tray icon in the Windows notification area immediately upon application startup.

#### Scenario: Application starts
- GIVEN the application is launching
- WHEN the Wails application reaches the `startup` lifecycle phase
- THEN the system tray icon MUST be visible in the notification area
- AND the application's main window MUST be hidden

### Requirement: Context Menu Structure

The system tray icon MUST provide a context menu with exactly two primary actions: "Abrir" and "Salir".

#### Scenario: User opens tray context menu
- GIVEN the application is running in the background
- WHEN the user right-clicks the system tray icon
- THEN a menu MUST appear with "Abrir" and "Salir" options

### Requirement: "Abrir" Action Behavior

The "Abrir" menu item MUST display the application's main window.

#### Scenario: Window is hidden
- GIVEN the application main window is hidden
- WHEN the user clicks "Abrir" in the tray menu
- THEN the main window MUST become visible
- AND the window MUST gain focus

#### Scenario: Window is already visible
- GIVEN the application main window is already visible
- WHEN the user clicks "Abrir" in the tray menu
- THEN the main window MUST remain visible and focused
- AND no new window instances SHALL be created

### Requirement: "Salir" Action Behavior

The "Salir" menu item MUST initiate a graceful shutdown of the application.

#### Scenario: User requests exit
- GIVEN the application is running
- WHEN the user clicks "Salir" in the tray menu
- THEN the application MUST close the main window if visible
- AND the application MUST gracefully terminate the Wails lifecycle

#### Scenario: User requests exit during active synchronization
- GIVEN the application is performing an active file synchronization
- WHEN the user clicks "Salir" in the tray menu
- THEN the application SHOULD log the interruption
- AND the application MUST still gracefully terminate without hanging

### Requirement: Tray Cleanup on Shutdown

The system MUST completely remove the system tray icon when the application exits.

#### Scenario: Application shuts down
- GIVEN the application is shutting down via any valid method
- WHEN the Wails application reaches the `shutdown` lifecycle phase
- THEN the system MUST call the tray quit function
- AND the tray icon MUST be removed from the Windows notification area
