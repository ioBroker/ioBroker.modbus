![Logo](admin/modbus.png)
## iobroker.modbus

Implementation of ModBus Slave and Master for ioBroker. Actually only Modbus over TCP is supported.

### Settings
#### Partner IP Address
IP address of modbus partner.

#### Port
TCP Port of modbus partner if configured as master (client) or own port if configured as slave(server).

#### Device ID
Modbus Device ID. Important if TCP/Modbus bridge is used.

#### Type
Slave(Server) or Master(Client).

#### Use aliases as address
Normally all registers can have address from 0 to 65535. By using of aliases you can define virtual address fields for every type of registers. Normally:
- discrete inputs are from 10001 to 20000
- coils are from 1 to 1000
- input registers are from 30001 to 40000
- holding registers are from 40001 to 60000

Every alias will be mapped internally to address, e.g. 30011 will be mapped to input register 10. and so on.
 
#### Round Real to
How many digits after comma for float and doubles.

#### Poll delay
Cyclic poll interval (Only relevant for master)

#### Reconnect time
Reconnection interval (Only relevant for master)

#### Pulse time
if pulse used for coils, this define the interval how long is pulse.

#### Max read request length
Maximal length of command READ_MULTIPLE_REGISTERS as number of registers to read. 

Some systems require first "write request" to deliver the data on "read request".
You can force this mode by setting of the "Max read request length" to 1.

# Changelog
# 0.3.7 (2015-11-02) 
* (bluefox) add special read/write mode if "Max read request length" is 1.

# 0.3.6 (2015-11-01) 
* (bluefox) add cyclic write for holding registers (fix)

# 0.3.5 (2015-10-31) 
* (bluefox) add cyclic write for holding registers

# 0.3.4 (2015-10-28) 
* (bluefox) add doubles and fix uint64

# 0.3.3 (2015-10-27) 
* (bluefox) fix holding registers

# 0.3.2 (2015-10-27) 
* (bluefox) fix import from text file

# 0.3.1 (2015-10-26) 
* (bluefox) fix error with length of read block (master)
* (bluefox) support of read blocks and maximal length of read request (master)
* (bluefox) can define fields by import

# 0.3.0 (2015-10-24) 
* (bluefox) add round settings
* (bluefox) add deviceID
* (bluefox) slave supports floats, integers and strings

# 0.2.6 (2015-10-22)
* (bluefox) add different types for inputRegisters and for holding registers ONLY FOR MASTER

# 0.2.5 (2015-10-20)
* (bluefox) fix names of objects if aliases used

# 0.2.4 (2015-10-19)
* (bluefox) fix error add new values

# 0.2.3 (2015-10-15)
* (bluefox) fix error with master

# 0.2.2 (2015-10-14)
* (bluefox) implement slave
* (bluefox) change addressing model

# 0.0.1
* (bluefox) initial commit
