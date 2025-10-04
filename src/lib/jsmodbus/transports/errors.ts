const ERROR_CODES: { [code: number]: { name: string; desc: string } } = {
    1: { name: 'Illegal Function', desc: 'Function code received in the query is not recognized or allowed by slave' },
    2: {
        name: 'Illegal Data Address',
        desc: 'Data address of some or all the required entities are not allowed or do not exist in slave',
    },
    3: { name: 'Illegal Data Value', desc: 'Value is not accepted by slave' },
    4: {
        name: 'Slave Device Failure',
        desc: 'Unrecoverable error occurred while slave was attempting to perform requested action',
    },
    5: {
        name: 'Acknowledge',
        desc: 'Slave has accepted request and is processing it, but a long duration of time is required. This response is returned to prevent a timeout error from occurring in the master. Master can next issue a Poll Program Complete message to determine whether processing is completed',
    },
    6: {
        name: 'Slave Device Busy',
        desc: 'Slave is engaged in processing a long-duration command. Master should retry later',
    },
    7: {
        name: 'Negative Acknowledge',
        desc: 'Slave cannot perform the programming functions. Master should request diagnostic or error information from slave',
    },
    8: {
        name: 'Memory Parity Error	Slave',
        desc: 'detected a parity error in memory. Master can retry the request, but service may be required on the slave device',
    },
    10: {
        name: 'Gateway Path Unavailable',
        desc: 'Specialized for Modbus gateways. Indicates a misconfigured gateway',
    },
    11: {
        name: 'Gateway Target Device Failed to Respond',
        desc: 'Specialized for Modbus gateways. Sent when slave fails to respond',
    },
};

export default ERROR_CODES;
