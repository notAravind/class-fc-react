import { Component } from "react";

class ReactComp extends Component {
  constructor() {
    this.state = {
      name: "S",
    };
  }

  hello() {
    this.setState({ name: "s" });
  }
  render() {
    return <div>Hello</div>;
  }
}

// const a = () => {
//   const b = () => {};
//   return <div> </div>;
// };

// ({});
