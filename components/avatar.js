import React from "react"

class Avatar extends React.Component {
  constructor(props) {
    super(props);
    this.getBgSize = this.getBgSize.bind(this); 
  }

  getBgSize(){
    let px = String(this.props.data.scale * 10)+"px"
    return px + " " + px
  }

  getOffset(offset){
    let y = String(offset % 10) * - this.props.data.scale + "px"
    let x = String(Math.floor(offset / 10)) * -this.props.data.scale + "px"
    return y + " " + x
  }

  render() {
    return (
      <div className="avatar avatarFit">
        <div className="colors" style={{"backgroundSize": this.getBgSize(), "backgroundPosition": this.getOffset(this.props.data[2])}}/>
        <div className="faces " style={{"backgroundSize": this.getBgSize(), "backgroundPosition": this.getOffset(this.props.data[1])}}/>
        <div className="hats  " style={{"backgroundSize": this.getBgSize(), "backgroundPosition": this.getOffset(this.props.data[0])}}/>
      </div>
    )
  }
}

export default Avatar
