# Older changes
## 8.0.3 (2026-02-17)
* (@GermanBluefox) Set the default value of a slave to '0' and not to 0
* (@GermanBluefox) Showed address 0

## 8.0.1 (2026-02-16)
* (@GermanBluefox) Disable logging of request timeout if `disableLogging` parameter is set to true

## 8.0.0 (2026-02-15)
* (bluefox) Minimal Node.js version is 20
* (bluefox) Corrected `info.connected` type
* (bluefox) Fixed writing of registers

## 7.0.6 (2025-10-29)
* (bluefox) Updated packages

## 7.0.5 (2025-10-13)
* (bluefox) Prohibited installation from github

## 7.0.4 (2025-10-08)
* (bluefox) Added migration procedure from 6 to 7
* (bluefox) Corrected serial communication

## 7.0.1 (2025-10-07)
* (bluefox) Redesign of the configuration tabs
* (bluefox) Added an option to remove leading underscores in the object names

## 7.0.0 (2025-10-06)
* (copilot) Improved Modbus error handling and fault tolerance - continue polling working devices even when others fail
* (copilot) Fixes memory leak
* (copilot) Added an option to disable connection error logging to avoid log spam when devices are unavailable
* (bluefox) Show values directly in the configuration
* (bluefox) Implemented TLS connection (master)

## 6.4.0 (2024-11-22)
* (bluefox) Moved GUI compilation to vite
* (bluefox) Added an error message if the response length is invalid

## 6.3.2 (2024-08-29)
* (bluefox) Corrected the error with alignment of addresses

## 6.3.0 (2024-08-28)
* (Apollon77) Fix Timeout management to prevent leaking memory
* (bluefox) Added information about connected clients in the server mode
* (bluefox) Tried to fix the error with aligning addresses
* (bluefox) GUI was migrated to admin 7

## 6.2.3 (2024-05-25)
* (Q7Jensen) Fixed error at aligning addresses to word
* (Apollon77) Added device id to some errors

## 6.2.2 (2024-04-26)
* (Apollon77) Downgrade gulp to 4.0.2 to fix build

## 6.2.1 (2024-04-16)
* (PLCHome) Warning regarding scale factor due to incorrect check: "Calculation of a scaleFactor which is based on another scaleFactor seems strange."

## 6.2.0 (2024-04-12)
* (PLCHome) String based on 16-bit values big endian as well as little endian
* (PLCHome) Raw data as a hex string
* (PLCHome) Fix issue `stringle` was always converted to number for a slave
* (PLCHome) Enable formula for strings and hex strings

## 6.1.0 (2023-12-14)
* (nkleber78) Implement the connection keepAlive

## 6.0.1 (2023-10-30)
* (bluefox) Better tooltips in settings

## 6.0.0 (2023-10-27)
* (bluefox) GUI packages updated
* (bluefox) Added help for settings
* (bluefox) Minimal supported node.js version is 16

## 5.0.11 (2022-12-01)
* (clausmuus) fixed reconnect of serial communication

## 5.0.8 (2022-09-27)
* (bluefox) GUI packages updated

## 5.0.5 (2022-08-13)
* (Apollon77) Prevent some crash cases reported by Sentry

## 5.0.4 (2022-06-15)v
* (bluefox) Corrected the coils reading in slave mode
* (bluefox) Corrected type of connection indicator

## 5.0.3 (2022-05-13)
* (bluefox) Fixed error with multi-devices

## 5.0.0 (2022-05-11)
* BREAKING: All space characters will be replaced with underscores now in the Objects IDs, not only the first one.
* (Apollon77) Catch error reported by sentry when the invalid Master port is entered
* (bluefox) GUI migrated to mui-v5

## 4.0.4 (2022-03-25)
* (Apollon77/UncleSamSwiss) Prevent invalid state log

## 4.0.3 (2022-03-21)
* (bluefox) Updated serial port package
* (bluefox) A minimal node.js version is 12

## 3.4.17 (2021-11-11)
* (Apollon77) Catch errors in tasks processing to prevent crashes

## 3.4.15 (2021-11-09)
* (Apollon77) Catch errors in tasks processing to prevent crashes
* (Apollon77) make sure generated IDs do not end with "."

## 3.4.14 (2021-08-31)
* (nkleber78) Fixed issue with sorting
* (bluefox) Corrected the calculations with a scaling factor
* (bluefox) Read times were optimized

## 3.4.11 (2021-07-31)
* (bluefox) Corrected import of last line

## 3.4.10 (2021-07-30)
* (Apollon77) Make sure that slave reconnections at least wait 1000ms to allow old connectio to close properly
* (bluefox) Corrected the error with writing single registers

## 3.4.9 (2021-07-06)
* (bluefox) Changed edit behaviour

## 3.4.8 (2021-06-24)
* (Apollon77) Fix a crash case on writing floats (Sentry IOBROKER-MODBUS-2D)

## 3.4.7 (2021-06-22)
* (bluefox) Corrected addressing with aliases in GUI

## 3.4.6 (2021-06-21)
* (bluefox) Corrected addressing with aliases

## 3.4.5 (2021-06-19)
* (bluefox) Corrected the "write multiple registers" option

## 3.4.4 (2021-06-16)
* (bluefox) GUI bugs were corrected
* (bluefox) Added output of error codes

## 3.4.2 (2021-06-15)
* (nkleber78) Corrected issue with the scale factors
* (bluefox) New react GUI added
* (bluefox) Add a new option: Use only Write multiple registers, read interval

## 3.3.1 (2021-05-10)
* (bluefox) fixed the configuration dialog for "input registers" in slave mode

## 3.3.0 (2021-04-16)
* (Apollon77) Allowed usage of write-only (no poll) states
* (Apollon77/TmShaz) F Write multiple registers
* (prog42) create states of type string with the default value of type string

## 3.2.6 (2021-03-05)
* (Apollon77) Prevent a crash case (Sentry IOBROKER-MODBUS-20)
* (Apollon77) Better handle invalid responses

## 3.2.4 (2021-01-30)
* (Sierra83) also supports ttyXRUSB0 style devices

## 3.2.3 (2021-01-21)
* (Apollon77) Catch value encoding error and do not crash adapter (Sentry IOBROKER-MODBUS-1W)
* (Apollon77) add a meta-object as an instance object

## 3.2.2 (2020-12-15)
* (Apollon77) prevent a rash case (Sentry IOBROKER-MODBUS-1S)

## 3.2.1 (2020-12-12)
* (Apollon77) prevent a crash case (Sentry IOBROKER-MODBUS-1R)

## 3.2.0 (2020-12-09)
* (nkleber78) Fixed the formula where the return keyword was missing

## 3.1.13 (2020-12-07)
* (nkleber78) Added the possibility to use formulas for values

## 3.1.12 (2020-12-05)
* (Apollon77) fix admin serial port selection

## 3.1.10 (2020-09-25)
* (nkleber78) Corrected: the exported data cannot be imported without modification

## 3.1.9 (2020-09-17)
* (Apollon77) Prevent a crash case (Sentry IOBROKER-MODBUS-1C)

## 3.1.7 (2020-07-23)
* (Apollon77) Fix some Sentry crash reports (IOBROKER-MODBUS-N)

## 3.1.6 (2020-07-06)
* (bluefox) Fix some Sentry crash reports (IOBROKER-MODBUS-J)

## 3.1.5 (2020-06-29)
* (Apollon77) Fix some Sentry crash reports (IOBROKER-MODBUS-F)

## 3.1.4 (2020-06-24)
* (Apollon77) Fix some Sentry crash reports (IOBROKER-MODBUS-4, IOBROKER-MODBUS-7, IOBROKER-MODBUS-6)
* (Apollon77) Change the way the adapter restarts when reconnections do not help

## 3.1.3 (2020-06-12)
* (Apollon77) fix scheduled restart

## 3.1.2 (2020-06-12)
* (Apollon77) fix serialport list for Admin

## 3.1.1 (2020-06-11)
* (Apollon77) Add Sentry crash reporting when used with js-controller >=3.x

## 3.1.0 (2020-06-11)
* (Apollon77) Make sure that regular adapter stops do not terminate the process, so that scheduled restarts still work
* (Apollon77) update serialport, support nodejs 12/14

## 3.0.4 (2020-06-05)
* (bluefox) Added device ID by export/import
* (bluefox) Added the "write interval" parameter
* (bluefox) Added the disabling of write multiple registers

## 3.0.3 (2020-06-05)
* (bluefox) Corrected error after refactoring

## 3.0.2 (2020-06-01)
* (compton-git) Decodes 0xFF00 as coil ON

## 3.0.1 (2020-01-23)
* (BlackBird77) Fixes for Serial Timeouts done
* (bluefox) Refactoring

## 3.0.0 (2019-05-15)
* (Apollon77) Support for Node.js 12 added, Node.js 4 is no longer supported!

## 2.0.9 (2018-10-11)
* (Bjoern3003) Write registers were corrected

## 2.0.7 (2018-07-02)
* (bluefox) The server mode was fixed

## 2.0.6 (2018-06-26)
* (bluefox) rtu-tcp master mode was fixed

## 2.0.3 (2018-06-16)
* (bluefox) Fixed the rounding of numbers

## 2.0.2 (2018-06-12)
* (bluefox) The error with block reading was fixed
* (bluefox) The block reading for discrete values was implemented

## 2.0.1 (2018-05-06)
* (bluefox) Added the support of multiple device IDs

## 1.1.1 (2018-04-15)
* (Apollon77) Optimize reconnect handling

## 1.1.0 (2018-01-23)
* (bluefox) Little endian strings added
* (Apollon77) Upgrade Serialport Library

## 1.0.2 (2018-01-20)
* (bluefox) Fixed read of coils

## 0.5.4 (2017-09-27)
* (Apollon77) Several Fixes

## 0.5.0 (2017-02-11)
* (bluefox) Create all states each after other

## 0.4.10 (2017-02-10)
* (Apollon77) Do not recreate all data points at the start of the adapter
* (ykuendig) Multiple optimization and wording fixes

## 0.4.9 (2016-12-20)
* (bluefox) fix serial RTU

## 0.4.8 (2016-12-15)
* (Apollon77) update serialport library for node 6.x compatibility

## 0.4.7 (2016-11-27)
* (bluefox) Use old version of jsmodbus

## 0.4.6 (2016-11-08)
* (bluefox) backward compatibility with 0.3.x

## 0.4.5 (2016-10-25)
* (bluefox) better buffer handling on tcp and serial

## 0.4.4 (2016-10-21)
* (bluefox) Fix write of holding registers

## 0.4.1 (2016-10-19)
* (bluefox) Support of ModBus RTU over serial and over TCP (only slave)

## 0.3.11 (2016-08-18)
* (Apollon77) Fixed the wrong byte count in loop

## 0.3.10 (2016-02-01)
* (bluefox) fixed lost of history settings.

## 0.3.9 (2015-11-09)
* (bluefox) Used always write_multiple_registers by writing of holding registers.

## 0.3.7 (2015-11-02)
* (bluefox) added special read/write mode if "Max read request length" is 1.

## 0.3.6 (2015-11-01)
* (bluefox) added cyclic write for holding registers (fix)

## 0.3.5 (2015-10-31)
* (bluefox) added cyclic write for holding registers

## 0.3.4 (2015-10-28)
* (bluefox) added doubles and fix uint64

## 0.3.3 (2015-10-27)
* (bluefox) fixed holding registers

## 0.3.2 (2015-10-27)
* (bluefox) fixed import from text file

## 0.3.1 (2015-10-26)
* (bluefox) fixed the error with the length of read block (master)
* (bluefox) support of read blocks and maximal length of read request (master)
* (bluefox) can define fields by import

## 0.3.0 (2015-10-24)
* (bluefox) add round settings
* (bluefox) add deviceID
* (bluefox) slave supports floats, integers and strings

## 0.2.6 (2015-10-22)
* (bluefox) add different types for inputRegisters and for holding registers ONLY FOR MASTER

## 0.2.5 (2015-10-20)
* (bluefox) fix names of objects if aliases are used

## 0.2.4 (2015-10-19)
* (bluefox) fix error add new values

## 0.2.3 (2015-10-15)
* (bluefox) fix error with master

## 0.2.2 (2015-10-14)
* (bluefox) implement slave
* (bluefox) change addressing model

## 0.0.1
* (bluefox) initial commit
