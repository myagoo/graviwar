import RAPIER from "@dimforge/rapier2d-compat";
import { Game, Object } from "./Game";
import { Item } from "./Item";
import { drawCircle, Vector } from "./utils";

export class Planet implements Object {
  public body: RAPIER.RigidBody;
  public collider: RAPIER.Collider;
  public mass: number;

  constructor(
    private game: Game,
    pos: Vector,
    vel: Vector,
    radius: number,
    private color: string,
    isStatic = false,
    itemCount = 0
  ) {
    const rotation = Math.atan2(vel.y, vel.x);
    this.body = this.game.world.createRigidBody(
      new RAPIER.RigidBodyDesc(
        isStatic ? RAPIER.RigidBodyType.Fixed : RAPIER.RigidBodyType.Dynamic
      )
        .setRotation(rotation)
        .setTranslation(pos.x, pos.y)
        .setLinvel(vel.x, vel.y)
    );


    this.collider = this.game.world.createCollider(
      RAPIER.ColliderDesc.ball(radius)
        .setDensity(100)
        .setFriction(1)
        .setRestitution(0)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      this.body
    );

    this.mass = this.body.mass();

    this.body.userData = this

    for(let i = 0; i < itemCount; i++){
      this.game.objects.push(new Item(game, this))
    }
  }

  loop(){}

  draw() {
    const position = this.body.translation();
    const radius = (this.collider.shape as RAPIER.Ball).radius;
    drawCircle(this.game.ctx, position, radius, this.color);
  }

  destroy(){
    this.game.world.removeCollider(this.collider, false)
    this.game.world.removeRigidBody(this.body)
    this.game.objects.splice(this.game.objects.indexOf(this), 1)
  }

  handleCollisionWith(object: Object, magnitude: number): void {
      
  }
}
