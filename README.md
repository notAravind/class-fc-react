## Code Mod for Class Components to Functional Components in React

### Before Running

Install `jscodeshift` through npm

```sh
npm install -g jscodeshift
```

## Running Script

Paste the Class Components in the sampleSource.jsx.

Run

```sh
npm run exec
```

### What It can do

Its just kind of co-pilot not an actual transpiler.

#### Overview

- [Classic state initializtion to hook based](#classic-state-initializtion-to-hook-based)

- [Transforming setState to appropriate hook's setState](#transforming-setstate-to-appropriate-hook's-setstate)

- [Transforming `createRef` to `useRef` hook](#transforming-`createRef`-to-`useRef`-hook)

- [Transforming Class Member Function into Arrow Function](#transforming-class-member-function-into-arrow-function)

- [Moving constructor, componentDidmount to useEffect and componentWillunmount to useEffect return](#moving-constructor,-componentDidmount-to-useEffect-and-componentWillunmount-to-useEffect-return)

##### Classic state initializtion to hook based

```javascript
this.state = {
  some: "useless",
};
```

into

```javascript
const [some, setSome] = useState("useful");
```

#### Transforming setState to appropriate hook's setState

```javascript
this.setState({ some: "state", another: "state" });
```

into

```javascript
setSome("state");
setAnother("state");
```

#### Transforming `createRef` to `useRef` hook

```javascript
class Process extends Component {

    constructor() {
        this.formRef = React.createRef()
    }

    ...
}
```

into

```javascript
const Process = () => {
    const formRef = useRef()

    ...
}
```

#### Transforming Class Member Function into Arrow Function

```javascript
class Process extends Component {
    blowUp(someArg, anotherArg) {
        ...
    }

}
```

into

```javascript
const Process = () => {
    const blowUp = (someArg, anotherArg) => {
        ...
    }
}
```

#### Moving constructor, componentDidmount to useEffect and componentWillunmount to useEffect return

```javascript
class Process extends Component {

    constructor() {
        doSomething()
        ...
    }

    componentDidmount() {
        doSomethingElse()
        ...
    }

    componentWillunmount() {
        unsubscribe()
    }
}
```

into

```javascript
const Process = () => {
  useEffect(() => {
    doSomething();
    doSomethingElse();

    return () => {
      unsubscribe();
    };
  });
};
```

##### There might some unexpected behavior which may feel buggy, yes it is. Sorry for that 😅
