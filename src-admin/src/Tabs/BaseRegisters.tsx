import React, { Component } from 'react';

import { Paper } from '@mui/material';

import RegisterTable from '../Components/RegisterTable';
import { parseAddress, direct2nonDirect, alias2address } from '../Components/Utils';
import type { ModbusAdapterConfig, Register, RegisterField, RegisterType } from '../types';
import type { AdminConnection, ThemeType } from '@iobroker/adapter-react-v5';

interface BaseRegistersProps {
    common: ioBroker.InstanceCommon;
    native: ModbusAdapterConfig;
    instance: number;
    adapterName: string;
    onError?: (error: string) => void;
    onLoad?: () => void;
    onChange: (field: string, value: Register[]) => void;
    changed?: boolean;
    socket: AdminConnection;
    rooms?: Record<string, ioBroker.EnumObject>;
    formulaDisabled?: boolean;
    themeType: ThemeType;
}

interface BaseRegistersState {
    order: 'asc' | 'desc';
    orderBy: keyof Register | '$index';
}

export default abstract class BaseRegisters extends Component<BaseRegistersProps, BaseRegistersState> {
    protected nativeField: RegisterType;
    protected fields: RegisterField[];

    protected constructor(props: BaseRegistersProps) {
        super(props);
        this.state = {
            order: (window.localStorage.getItem('Modbus.order') as 'asc' | 'desc') || 'asc',
            orderBy: (window.localStorage.getItem('Modbus.orderBy') as keyof Register) || '_address',
        };
    }

    componentDidMount(): void {
        if (!window.localStorage.getItem('Modbus.orderBy')) {
            this.fields ||= this.getFields();
            const isSlaveIDPresent = !!this.fields.find(item => item.name === 'deviceId');
            const orderBy = isSlaveIDPresent ? 'deviceId' : '_address';

            if (orderBy !== this.state.orderBy) {
                this.setState({ orderBy });
            }
        }
    }

    // eslint-disable-next-line class-methods-use-this
    isShowExtendedModeSwitch(): boolean {
        return true;
    }

    abstract getFields(): RegisterField[];

    addressToCanonical(_address: string | number): number {
        // Parse hex addresses (0x prefix) to decimal
        let address = parseAddress(_address);
        const params = this.props.native.params;
        if (params.showAliases) {
            if (params.directAddresses) {
                address = direct2nonDirect(this.nativeField, address);
            }
            address = alias2address(this.nativeField, address);
        }
        return address;
    }

    changeParam = (index: number, name: keyof Register, value: string | boolean | number): void => {
        const data: Register[] = JSON.parse(JSON.stringify(this.props.native[this.nativeField]));
        (data[index] as unknown as Record<string, string | boolean | number>)[name] = value;
        if (name === '_address') {
            data[index].address = this.addressToCanonical(value as string);
        }
        this.props.onChange(this.nativeField, data);
    };

    // eslint-disable-next-line class-methods-use-this
    addItem = (): void => {};

    deleteItem = (index: number): void => {
        const data = JSON.parse(JSON.stringify(this.props.native[this.nativeField]));
        data.splice(index, 1);
        this.props.onChange(this.nativeField, data);
    };

    changeData = (data: Register[]): void => {
        this.props.onChange(this.nativeField, data);
    };

    // eslint-disable-next-line class-methods-use-this
    getDisable = (_index: number, _name: keyof Register): boolean => {
        return false;
    };

    getSortedData = (
        data?: Register[],
        orderBy?: keyof Register | '$index',
        order?: 'asc' | 'desc',
    ): { item: Register; $index: number }[] => {
        data ||= this.props.native[this.nativeField];
        orderBy ||= this.state.orderBy;
        order ||= this.state.order;
        const sortedData: { item: Register; $index: number }[] = [];
        data.forEach((item, index) => {
            sortedData[index] = { item, $index: index };
        });
        const field = this.fields.find(item => item.name === orderBy);

        sortedData.sort((sortedItem1, sortedItem2) => {
            let sort1: number | string | boolean | undefined;
            let sort2: number | string | boolean | undefined;
            if (orderBy === 'deviceId') {
                sort1 =
                    (parseInt(sortedItem1.item.deviceId as string, 10) << 16) | parseAddress(sortedItem1.item._address);
                sort2 =
                    (parseInt(sortedItem2.item.deviceId as string, 10) << 16) | parseAddress(sortedItem2.item._address);
            } else if (orderBy === '$index') {
                sort1 = sortedItem1[orderBy];
                sort2 = sortedItem2[orderBy];
            } else if (orderBy === '_address') {
                // Handle hex addresses for sorting
                sort1 = parseAddress(sortedItem1.item[orderBy]);
                sort2 = parseAddress(sortedItem2.item[orderBy]);
            } else if (field && field.type === 'number') {
                sort1 = parseInt(sortedItem1.item[orderBy] as string, 10);
                sort2 = parseInt(sortedItem2.item[orderBy] as string, 10);
            } else {
                sort1 = sortedItem1.item[orderBy];
                sort2 = sortedItem2.item[orderBy];
            }
            if (sort1 === undefined || sort1 === null || sort1 === '') {
                return 1;
            }
            if (sort2 === undefined || sort2 === null || sort2 === '') {
                return -1;
            }
            if (sort1 === sort2) {
                return 0;
            }

            return (order === 'asc' ? sort1 > sort2 : sort1 < sort2) ? 1 : -1;
        });

        return sortedData;
    };

    render(): React.JSX.Element {
        this.fields ||= this.getFields();

        return (
            <Paper>
                <RegisterTable
                    fields={this.fields}
                    themeType={this.props.themeType}
                    data={this.props.native[this.nativeField]}
                    getSortedData={this.getSortedData}
                    changeParam={this.changeParam}
                    addItem={this.addItem}
                    deleteItem={this.deleteItem}
                    changeData={this.changeData}
                    getDisable={this.getDisable}
                    formulaDisabled={this.props.formulaDisabled}
                    rooms={this.props.rooms || {}}
                    order={this.state.order}
                    orderBy={this.state.orderBy}
                    onChangeOrder={(orderBy, order) => {
                        this.setState({ orderBy, order });
                        window.localStorage.setItem('Modbus.orderBy', orderBy);
                        window.localStorage.setItem('Modbus.order', order);
                    }}
                />
            </Paper>
        );
    }
}
