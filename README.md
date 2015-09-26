![Logo](admin/S7.png)
### iobroker.s7

## Deutsch
Der Siemens S7 Adapter basiert auf Snap7, wobei Snap7 bei der Erstinstallation des 
S7 Adapters mitinstalliert wird und die eigentliche S7-Kommunikation zwischen ioBroker und der S7 über TCP/IP organisiert.

Es ist also notwendig, dass die S7 über eine Ethernet-Schnittstelle verfügt 
(in der CPU integriert oder als separater CP) und über TCP/IP mit der Hardware kommunizieren kann, auf der ioBroker läuft.

Es wird vorausgesetzt, dass der Anwender über die notwendigen Kenntnisse zur TCP/IP-Kommunikation verfügt 
und in der Lage ist, die S7 mittels Step7 entsprechend zu konfigurieren und zu programmieren. 
Der geübte Umgang mit PC und verschiedenen Betriebssystem ist ebenfalls Voraussetzung. 
Diese Anforderungen stellen sicherlich keine Herausforderung für jemanden dar, 
der die Kommunikation zwischen ioBroker und einer S7 in Erwägung zieht.

### Installation
Unter Linux braucht man "make" Umgebung um die binries zu bauen. Das kann man mit folgenden Kommando installieren:

```
sudo apt-get update
sudo apt-get install build-essential
```

Unter windows braucht man Visual Studio 2013 (Community Edition ist genug) oder später.
## English
Format of the addresses for Inputs, Outputs or markers is "X.Y", where X is byte offset and Y is bit offset in byte.
Format of the addresses for DBs is "DBZ +X.Y", where z is number of DB, like "DB34 +12.0"

### Install
On some Linux systems the build essentials must be installed to get this adapter work. You can install it with:

```
sudo apt-get update
sudo apt-get install build-essential
```

Under windows is Visual Studio 2013 (Community Edition is enough) or later is required to get it run.

## TODO
  Time offset for S7 time.

# Changelog 
#0.2.3 [2015.09.24]
* (bluefox) add suppor of Logo!

#0.2.2 [2015.09.11]
* (bluefox) add S7time
* (bluefox) support rooms and roles
* (bluefox) it works
* (bluefox) update packets

#0.2.1 [2015.09.09]
* (bluefox) fix creation of objects

#0.2.0 [2015.08.15]
* (bluefox) improve performance and enable DB2 3.9 addresses.

#0.1.8 [2015.08.10]
* (smiling_Jack) Bugfix send info states
* (smiling_Jack) Remove unneeded conole.log

#0.1.7 [2015.08.06]
* (smiling_Jack) Bugfix send to SPS
* (smiling_Jack) Bugfix reconnect on connection lost

#0.1.6 [2015.07.31]
* (smiling_Jack) Bugfix typo (Adress, Merkers)

#0.1.5 [2015.07.29]
* (smiling_Jack) Bugfix translation Admin

#0.1.4 [2015.07.28]
* (smiling_Jack) Add S5Time as Type
* (smiling_Jack) Bugfix History
* (smiling_Jack) Bugfix (fast value change)

#0.1.3 [2015.06.04]
* (bluefox) translate admin
* (bluefox) remove jshint warnings
* (bluefox) add info.connected and rename info.connection to info.state

#0.1.2
* Bugfix startup
* Bugfix add states

#0.1.1
* change import options

#0.1.0
* redesign Admin UI
* add write as Pulse
* Bugfix delete unused objects

#0.0.8
* Bugfix start file
* Bugfix DB import
* Working on Admin style
* Add Units

#0.0.6
* Bugfix start file