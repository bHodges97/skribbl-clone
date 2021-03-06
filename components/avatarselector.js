import React from "react"
import Avatar from "./avatar"

function rand() {
  return Math.floor(Math.random() * 13);
}

class AvatarSelector extends React.Component {
  constructor(props) {
    super(props);
    this.handleClick = this.handleClick.bind(this); 
    this.randomise = this.randomise.bind(this);

    this.state = {
      hat: 0,
      face: 0,
      color: 0,
      scale:96
    }
  }

  handleClick(i,j) {
    let a = this.state[i] + j
    if(a<0)a=13;
    if(a>13)a=0;
    this.setState({[i]: a});  
    this.props.update(i, a)
  }
  
  randomise() {
    this.setState({
      hat: rand(),
      face: rand(),
      color: rand()
    },()=>{
      this.props.update("hat", this.state.hat)
      this.props.update("face", this.state.face)
      this.props.update("color", this.state.color)
    }
    );
  }

  componentDidMount() {
    this.randomise();
  }

  render() {
    return (
      <div id="loginAvatarCustomizeContainer">
        <div id="loginAvatarCustomizerRandomize" onClick={this.randomise}>randomise</div>
        <div className="avatarArrows">
          <div className="avatarArrow" onClick={()=>this.handleClick("hat",-1)}></div>
          <div className="avatarArrow" onClick={()=>this.handleClick("face",-1)}></div>
          <div className="avatarArrow" onClick={()=>this.handleClick("color",-1)}></div>
        </div>
        <div className="avatarContainer">
          <Avatar style="avatarFit" hat={this.state.hat} face={this.state.face} color={this.state.color} scale={this.state.scale}/>
        </div>
        <div className="avatarArrows">
          <div className="avatarArrow avatarArrowRight" onClick={()=>this.handleClick("hat",1)}></div>
          <div className="avatarArrow avatarArrowRight" onClick={()=>this.handleClick("face",1)}></div>
          <div className="avatarArrow avatarArrowRight" onClick={()=>this.handleClick("color",1)}></div>
        </div>
      </div>
  )
  }
}

export default AvatarSelector
